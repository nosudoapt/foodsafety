import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * Manager-or-above request to re-send a location's combined daily report.
 * The SQL function re-checks role and membership, warns nothing, enqueues one
 * outbox job per configured recipient under a unique request key, and records
 * the reason for the audit trail. Designers never reach this route.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 8_000);
  const location = body.location_id;
  const date = body.date;
  const key = body.key;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BtbApiError("Choose a valid report date.");
  if (!isUuid(key)) throw new BtbApiError("A resend request key is required.");
  if (reason.length < 3) throw new BtbApiError("Give a short reason for the resend.");
  const result = await platformRpc(db, "btb_platform_resend", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_date: date,
    p_key: key,
    p_reason: reason.slice(0, 500),
  }, "The resend request could not be queued.");
  return { result };
});
