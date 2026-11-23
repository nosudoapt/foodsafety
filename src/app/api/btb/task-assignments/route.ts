import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { assignmentProblem, type TaskAssignment } from "@/lib/btb-tasks";
import { withCompletion } from "@/lib/btb-task-completion";
import { isIsoDate, isUuid } from "@/lib/btb-team";

const COLUMNS = "id,location_id,employee_id,task_date,task_type,note";

function weekEnd(start: string): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

export const GET = btbRoute("staff_schedule", false, async ({ db, identity, access }, request) => {
  const params = new URL(request.url).searchParams;
  const location = params.get("location"), start = params.get("start");
  if (!isUuid(location) || !isIsoDate(start)) throw new BtbApiError("Choose a branch and a valid week.");
  if (!access.locations.some((site) => site.id === location)) throw new BtbApiError("This branch is not in your workspace.", 403);
  const canManage = ["manager", "supervisor"].includes(identity.role);
  // The shared demo has no personal employee id; it has no assigned duties.
  if (!canManage && !identity.employeeId) return { assignments: [], canManage: false };
  let query = db.from("btb_task_assignments").select(COLUMNS).eq("location_id", location)
    .gte("task_date", start).lte("task_date", weekEnd(start));
  if (!canManage) query = query.eq("employee_id", identity.employeeId!);
  const result = await query.order("task_date").order("task_type");
  dbError(result.error, "Task assignments could not be loaded. Please retry.");
  const rows = (result.data ?? []) as TaskAssignment[];
  const ids = [...new Set(rows.map((row) => row.employee_id))];
  const people = ids.length ? await db.from("btb_employees").select("id,name").in("id", ids) : { data: [], error: null };
  dbError(people.error, "Assigned employees could not be loaded.");
  const names = new Map((people.data ?? []).map((person) => [person.id as string, person.name as string]));
  return {
    assignments: (await withCompletion(db, location, rows)).map((row) => ({ ...row, employee_name: names.get(row.employee_id) ?? "Former employee" })),
    canManage,
  };
}, { allowLocationWorkspace: true });

export const POST = btbRoute("staff_schedule", true, async ({ db, identity, access }, request) => {
  const body = await readBody(request, 4096);
  const problem = assignmentProblem(body);
  if (problem) throw new BtbApiError(problem);
  const location = String(body.location_id);
  if (!access.locations.some((site) => site.id === location && site.active)) throw new BtbApiError("Choose an active branch you manage.", 403);
  const member = await db.from("btb_location_access").select("employee_id")
    .eq("location_id", location).eq("employee_id", String(body.employee_id)).maybeSingle();
  dbError(member.error, "The employee’s branch could not be verified.");
  if (!member.data) throw new BtbApiError("Choose an employee assigned to this branch.", 400);
  const saved = await db.from("btb_task_assignments").upsert({
    location_id: location, employee_id: String(body.employee_id), task_date: String(body.task_date),
    task_type: String(body.task_type), note: String(body.note ?? "").trim(), created_by: identity.employeeId,
  }, { onConflict: "location_id,employee_id,task_date,task_type" }).select(COLUMNS).maybeSingle();
  dbError(saved.error, "The task assignment could not be saved.");
  if (!saved.data) throw new BtbApiError("The task assignment was not confirmed.", 503);
  return { assignment: { ...(saved.data as TaskAssignment), completed: false } };
}, { allowLocationWorkspace: true });

export const DELETE = btbRoute("staff_schedule", true, async ({ db, access }, request) => {
  const body = await readBody(request, 4096);
  if (!isUuid(body.id)) throw new BtbApiError("Reload the assignments before deleting one.");
  const location = String(body.location_id ?? "");
  if (!access.locations.some((site) => site.id === location)) throw new BtbApiError("This branch is not in your workspace.", 403);
  const result = await db.from("btb_task_assignments").delete().eq("id", body.id).eq("location_id", location);
  dbError(result.error, "The task assignment could not be removed.");
  return { ok: true };
}, { allowLocationWorkspace: true });
