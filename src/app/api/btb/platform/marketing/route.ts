import { BtbApiError, readBody } from "@/lib/btb-api";
import { isIsoDate, isUuid } from "@/lib/btb-team";
import { MARKETING_ACTIONS, type MarketingAction } from "@/lib/btb-platform-marketing";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * One transactional marketing workflow command per request. The SQL state
 * machine re-authorises the actor, membership and credential version on every
 * transition, so this route cannot widen it: a designer submitting straight to
 * approval still fails, and only a different corporate approver can approve.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 16_000);
  const location = body.location_id;
  const action = body.action as MarketingAction;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (!MARKETING_ACTIONS.includes(action)) throw new BtbApiError("Choose a marketing action.");
  if (action === "create") {
    const form = body.data;
    if (form == null || typeof form !== "object" || Array.isArray(form)) throw new BtbApiError("Send the promotion brief.");
    const data = form as Record<string, unknown>;
    if (typeof data.title !== "string" || data.title.trim().length < 2) throw new BtbApiError("Give the promotion a title.");
    if (typeof data.purpose !== "string" || data.purpose.trim().length < 2) throw new BtbApiError("Describe the purpose.");
    if (!isIsoDate(String(data.promotion_start ?? "")) || !isIsoDate(String(data.promotion_end ?? "")) || !isIsoDate(String(data.delivery_date ?? ""))) {
      throw new BtbApiError("Choose the promotion dates and the delivery date.");
    }
    if (data.promotion_end as string < (data.promotion_start as string)) throw new BtbApiError("The promotion cannot end before it starts.");
    if (!["pdf", "png", "jpg"].includes(String(data.required_file_type ?? ""))) throw new BtbApiError("Choose the required file type.");
    const dimension = data.dimensions as Record<string, unknown> | undefined;
    if (!dimension || !(Number(dimension.width) > 0) || !(Number(dimension.height) > 0)) throw new BtbApiError("Give the required artwork size.");
    if (typeof data.format_id === "string" && data.format_id !== "" && !isUuid(data.format_id)) throw new BtbApiError("Choose a format.");
  }
  const result = await platformRpc(db, "btb_platform_marketing", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_profile: employeeId,
    p_action: action,
    p_data: body.data ?? {},
  }, "This marketing request could not be saved.");
  return { result };
});
