import { btbRequestLocation, btbRoute, BtbApiError, dbError, readAll, readBody, TEAM_COLUMNS } from "@/lib/btb-api";
import { withLocation } from "@/lib/btb-location-context";
import { attributionName, BTB_RESTAURANT, isIsoDate, isUuid, isVersion, type TeamMember } from "@/lib/btb-team";
import { addDays } from "@/lib/staff-schedule";
import { SHIFT_DUTIES, shiftInterval, type BtbShift } from "@/lib/btb-operations";

const COLUMNS = "id,employee_id,shift_date,start_time,end_time,ends_next_day,duty,version,updated_by_name,updated_at";
export const GET = btbRoute("staff_schedule", false, async (context, request) => {
  const { db } = context;
  const location = await btbRequestLocation(context, request);
  const start = new URL(request.url).searchParams.get("start");
  if (!isIsoDate(start)) throw new BtbApiError("Choose a valid week.");
  // A branch schedule lists the people who actually work at that branch.
  let employeeIds: string[] | null = null;
  if (location) {
    const membership = await db.from("btb_location_access").select("employee_id").eq("location_id", location.id);
    if (membership.error) throw new BtbApiError("The branch team could not be loaded.", 503, membership.error);
    employeeIds = (membership.data ?? []).map((row) => row.employee_id as string);
  }
  const [employees, shifts] = await Promise.all([
    employeeIds && employeeIds.length === 0 ? Promise.resolve([] as TeamMember[])
      : readAll<TeamMember>((from, to) => {
        let query = db.from("btb_employees").select(TEAM_COLUMNS).eq("restaurant_name", BTB_RESTAURANT);
        if (employeeIds) query = query.in("id", employeeIds);
        return query.order("name").order("id").range(from, to);
      }, "The team list could not be loaded."),
    readAll<BtbShift>((from, to) => withLocation(db.from("btb_shifts").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT), location)
      .gte("shift_date", start).lt("shift_date", addDays(start, 7)).order("shift_date").order("start_time").order("id").range(from, to), "This week’s schedule could not be loaded."),
  ]);
  return { employees, shifts };
}, { allowLocationWorkspace: true });

export const POST = btbRoute("staff_schedule", true, async (context, request) => {
  const { db, identity } = context;
  const location = await btbRequestLocation(context, request);
  const body = await readBody(request);
  if (!isUuid(body.employee_id) || !isVersion(body.version) || (body.id != null && !isUuid(body.id)) || typeof body.ends_next_day !== "boolean" || !SHIFT_DUTIES.some((duty) => duty.value === body.duty)) throw new BtbApiError("Choose an employee and a valid shift duty.");
  const shift = body as unknown as BtbShift;
  if (!shiftInterval(shift)) throw new BtbApiError("Enter valid start and end times. For an overnight close, choose “Ends next day”.");
  const result = await db.rpc("btb_save_shift_scoped", {
    p_id: body.id ?? null, p_version: body.version, p_employee_id: body.employee_id, p_date: body.shift_date,
    p_start: body.start_time, p_end: body.end_time, p_next_day: body.ends_next_day, p_duty: body.duty,
    p_actor: attributionName(identity), p_location: location?.id ?? null,
  });
  if (result.error?.code === "42501") throw new BtbApiError("That employee is not assigned to this branch, so they cannot be scheduled here.", 403);
  if (result.error?.code === "23P01") throw new BtbApiError("This employee already has an overlapping shift. Adjust the times or edit that shift.", 409);
  dbError(result.error, "The shift could not be saved. Your draft is still here.");
  if (!result.data?.[0]?.id) throw new BtbApiError("The shift save was not confirmed. Please reload.", 503);
  return { shift: result.data[0] };
}, { allowLocationWorkspace: true });

export const DELETE = btbRoute("staff_schedule", true, async (context, request) => {
  const { db } = context;
  const location = await btbRequestLocation(context, request);
  const body = await readBody(request);
  if (!isUuid(body.id) || !isVersion(body.version)) throw new BtbApiError("Choose a saved shift.");
  const result = await withLocation(db.from("btb_shifts").delete().eq("restaurant_name", BTB_RESTAURANT), location)
    .eq("id", body.id).eq("version", body.version).select("id");
  dbError(result.error, "The shift could not be removed.");
  if (result.data?.length !== 1) throw new BtbApiError("This shift changed. Reload the week before removing it.", 409);
  return { ok: true };
}, { allowLocationWorkspace: true });
