import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { INVENTORY_ACTIONS, type InventoryAction } from "@/lib/btb-platform-inventory";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * One transactional inventory command per request. The SQL function is the
 * authorization boundary: it re-checks the actor, credential version,
 * location membership and (for corporate-only steps) role, then either commits
 * the whole change or rolls it back.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 512_000);
  const location = body.location_id;
  const action = body.action as InventoryAction;
  const month = body.month;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (!INVENTORY_ACTIONS.includes(action)) throw new BtbApiError("Choose an inventory action.");
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BtbApiError("Choose a valid accounting month.");
  const data = body.data;
  if (data != null && (typeof data !== "object" || Array.isArray(data))) throw new BtbApiError("Send a valid inventory form.");
  const result = await platformRpc(db, "btb_platform_inventory", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_month: month,
    p_action: action,
    p_data: data ?? {},
  }, "The inventory change could not be saved.");
  return { result };
});
