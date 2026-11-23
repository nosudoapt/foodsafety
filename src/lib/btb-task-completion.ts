import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "./btb-api";
import type { TaskAssignment, TaskType } from "./btb-tasks";

/** Completion is derived from the actual operational record for the business
 *  date — never from a manual tick on the assignment. Every lookup is filtered
 *  to the one branch, so another location's sheet can never mark this branch's
 *  duty complete. */
export async function withCompletion(db: SupabaseClient, locationId: string, assignments: TaskAssignment[]): Promise<TaskAssignment[]> {
  if (!assignments.length) return assignments;
  const dates = [...new Set(assignments.map((item) => item.task_date))];
  const done = new Map<string, Set<TaskType>>();
  const mark = (date: string, type: TaskType) => {
    const set = done.get(date) ?? new Set<TaskType>();
    set.add(type);
    done.set(date, set);
  };
  const [temperatures, prep, platformChecks, legacyChecks, cleaning] = await Promise.all([
    db.from("temperature_records").select("business_date").eq("location_id", locationId).in("business_date", dates),
    db.from("prep_counts").select("count_date").eq("location_id", locationId).in("count_date", dates),
    db.from("btb_shift_checks").select("check_date,check_type,completed").eq("location_id", locationId).in("check_date", dates),
    db.from("btb_checklists").select("check_date,check_type,completed").eq("location_id", locationId).in("check_date", dates),
    db.from("cleaning_logs").select("done_date").eq("location_id", locationId).in("done_date", dates),
  ]);
  dbError(temperatures.error ?? prep.error ?? platformChecks.error ?? legacyChecks.error ?? cleaning.error,
    "Assigned task completion could not be checked. Please retry.");
  for (const row of temperatures.data ?? []) if (row.business_date) mark(row.business_date as string, "temperature");
  for (const row of prep.data ?? []) if (row.count_date) mark(row.count_date as string, "prep_sheet");
  for (const row of cleaning.data ?? []) if (row.done_date) mark(row.done_date as string, "cleaning");
  for (const checks of [platformChecks.data ?? [], legacyChecks.data ?? []]) {
    for (const row of checks) {
      if (!row.completed || !row.check_date) continue;
      if (row.check_type === "opening") mark(row.check_date as string, "opening");
      if (row.check_type === "closing") mark(row.check_date as string, "closing");
      if (row.check_type === "cleaning") mark(row.check_date as string, "cleaning");
    }
  }
  return assignments.map((item) => ({ ...item, completed: done.get(item.task_date)?.has(item.task_type) ?? false }));
}

/** Assignments for one person/date that still need work. */
export async function incompleteAssignments(db: SupabaseClient, locationId: string, employeeId: string, date: string): Promise<TaskAssignment[]> {
  const result = await db.from("btb_task_assignments")
    .select("id,location_id,employee_id,task_date,task_type,note")
    .eq("location_id", locationId).eq("employee_id", employeeId).eq("task_date", date);
  dbError(result.error, "Assigned tasks could not be loaded before clock-out.");
  return (await withCompletion(db, locationId, (result.data ?? []) as TaskAssignment[])).filter((item) => !item.completed);
}
