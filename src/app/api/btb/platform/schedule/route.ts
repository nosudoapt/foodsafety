import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { SHIFT_DUTIES, shiftInterval, type BtbShift } from "@/lib/btb-operations";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 16_000);
  if (!isUuid(body.location_id) || !["save", "delete"].includes(String(body.action)) || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new BtbApiError("Choose a location and a schedule action.");
  const data = body.data as Record<string, unknown>;
  if (!isUuid(data.id) || !Number.isSafeInteger(data.version) || Number(data.version) < 0) throw new BtbApiError("Reload the saved shift first.");
  if (body.action === "save" && (!isUuid(data.employee_id) || typeof data.ends_next_day !== "boolean" || !SHIFT_DUTIES.some((item) => item.value === data.duty) || !shiftInterval(data as unknown as BtbShift))) throw new BtbApiError("Enter a valid employee, date and start/end times. Overnight shifts must say they end next day.");
  return { shift: await platformRpc(db, "btb_platform_schedule", {
    p_actor: employeeId, p_session: sessionVersion, p_location: body.location_id, p_action: body.action, p_data: data,
  }, "The shift could not be saved. Check location membership, timezone-aware overlaps and nearby legacy shifts. Avoid ambiguous daylight-saving boundary times; clocked shifts cannot be reassigned.") };
});
