// Actual punches use absolute instants, not wall-clock subtraction across DST.
import { isIsoDate, isUuid } from "./btb-team";
import type { BtbRole } from "./btb-roles";
import type { BtbShift } from "./btb-operations";
import type { TeamMember } from "./btb-team";
import { csvDocument } from "./btb-finance";

export interface TimeEntry {
  id: string; location_id: string; employee_id: string; shift_id: string | null; work_date: string;
  recorded_in: string; recorded_out: string | null; effective_in: string;
  effective_out: string | null; break_minutes: number | null;
  status: "open" | "pending" | "changes_requested" | "approved";
  version: number; notes: string; review_notes: string | null;
  reviewed_by_name: string | null; reviewed_at: string | null;
  incomplete_tasks?: { task_type: string; note: string }[];
}
export interface TimeData {
  timezone: string; today: string; employees: TeamMember[]; shifts: BtbShift[];
  entries: TimeEntry[]; open_entry: TimeEntry | null;
  history: { id: string; entity_id: string; action: string; actor_name: string; reason: string | null; created_at: string }[];
}
export const TIME_ACTIONS = ["clock_in", "clock_out", "correct", "approve", "request_changes", "reopen"] as const;
export type TimeAction = (typeof TIME_ACTIONS)[number];
export const canReviewTime = (role: BtbRole) => role === "manager" || role === "owner";
export const canClock = (role: BtbRole) => ["staff", "supervisor", "manager"].includes(role);
export function locationToday(timezone: string | null, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "America/Regina", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function instant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isIsoDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
export function workedMinutes(start: string | null, end: string | null, breaks: number | null): number | null {
  if (!instant(start) || !instant(end) || breaks === null || !Number.isInteger(breaks) || breaks < 0) return null;
  const elapsed = (Date.parse(end) - Date.parse(start)) / 60_000;
  return Number.isFinite(elapsed) && elapsed > 0 && elapsed <= 1440 && breaks <= elapsed ? elapsed - breaks : null;
}
export const entryMinutes = (entry: TimeEntry) => workedMinutes(entry.effective_in, entry.effective_out, entry.break_minutes);
export function hoursLabel(minutes: number | null): string { return minutes === null ? "Missing" : `${(minutes / 60).toFixed(2)} h`; }
export function hoursTotals(entries: readonly TimeEntry[]) {
  const closed = entries.filter((entry) => entry.status !== "open");
  const approved = entries.filter((entry) => entry.status === "approved");
  const total = (rows: readonly TimeEntry[]) => rows.some((entry) => entryMinutes(entry) === null)
    ? null : rows.reduce((sum, entry) => sum + entryMinutes(entry)!, 0);
  return {
    worked: total(closed),
    approved: total(approved),
    pending: entries.filter((entry) => entry.status === "pending" || entry.status === "changes_requested").length,
    open: entries.filter((entry) => entry.status === "open").length,
  };
}
export function timeProblem(action: TimeAction, data: Record<string, unknown>): string | null {
  if (data.notes != null && (typeof data.notes !== "string" || data.notes.length > 2000) || data.reason != null && (typeof data.reason !== "string" || data.reason.length > 2000)) return "Keep notes and reasons under 2,000 characters.";
  if (action === "clock_in") return data.shift_id != null && !isUuid(data.shift_id) ? "Choose your shift, or clock in as unscheduled." : null;
  if (!isUuid(data.id) || !Number.isSafeInteger(data.version) || Number(data.version) < 1) return "Reload this time entry before making a change.";
  if (["correct", "request_changes", "reopen"].includes(action) && (typeof data.reason !== "string" || !data.reason.trim())) return "Enter a reason so the original record and correction remain traceable.";
  if (action === "clock_out" || action === "correct") {
    if (!Number.isInteger(data.break_minutes) || Number(data.break_minutes) < 0 || Number(data.break_minutes) > 1440) return "Enter unpaid break minutes explicitly (0 if none).";
  }
  if (action === "correct") {
    if (!instant(data.effective_in) || !instant(data.effective_out) || workedMinutes(data.effective_in, data.effective_out, Number(data.break_minutes)) === null) return "Enter absolute start/end times with a UTC offset, a shift no longer than 24 hours, and valid breaks.";
  }
  return null;
}
export function approvedHoursCsv(entries: readonly TimeEntry[], employees: readonly TeamMember[], timezone: string): string {
  const approved = entries.filter((entry) => entry.status === "approved");
  if (approved.some((entry) => entryMinutes(entry) === null)) throw new Error("Approved hours contain incomplete or invalid time records. Reload and ask a manager to review them before exporting.");
  return csvDocument([
    ["Employee", "Business date", "Start (UTC)", "End (UTC)", "Unpaid break minutes", "Approved hours", "Approved by", "Approved at", "Location timezone"],
    ...approved.map((entry) => [employees.find((employee) => employee.id === entry.employee_id)?.name ?? "Former employee", entry.work_date, new Date(entry.effective_in).toISOString(), new Date(entry.effective_out!).toISOString(), entry.break_minutes, (entryMinutes(entry)! / 60).toFixed(4), entry.reviewed_by_name, entry.reviewed_at, timezone]),
  ]);
}
