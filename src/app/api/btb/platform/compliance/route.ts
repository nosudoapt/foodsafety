import { BtbApiError, readBody } from "@/lib/btb-api";
import { isIsoDate, isUuid } from "@/lib/btb-team";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * One transactional compliance document change per request: register or renew
 * a certificate with an explicit expiry confirmation, or correct details with
 * a reason. The SQL function re-checks role, membership, ownership of the
 * private certificate file, and version - staff/supervisor can only submit
 * their own certificates and never configure reminder recipients.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 16_000);
  const location = body.location_id;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  const doc = body.doc;
  if (doc == null || typeof doc !== "object" || Array.isArray(doc)) throw new BtbApiError("Send the certificate form.");
  const data = doc as Record<string, unknown>;
  if (data.id != null && !isUuid(String(data.id))) throw new BtbApiError("Unknown certificate.");
  for (const optionalDate of ["issue_date", "expiry_date"]) {
    if (data[optionalDate] != null && data[optionalDate] !== "" && !isIsoDate(String(data[optionalDate]))) {
      throw new BtbApiError(`Check the ${optionalDate.replace("_", " ")} date.`);
    }
  }
  if (data.employee_id != null && data.employee_id !== "" && !isUuid(String(data.employee_id))) throw new BtbApiError("Choose the certificate holder.");
  if (data.file_id != null && data.file_id !== "" && !isUuid(String(data.file_id))) throw new BtbApiError("Attach the certificate file first.");
  const result = await platformRpc(db, "btb_platform_compliance", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_data: data,
  }, "This certificate could not be saved.");
  return { document: result };
});
