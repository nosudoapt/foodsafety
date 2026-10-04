// Staff schedule — week maths, time formatting and the 90-day retention
// window. Pure helpers shared by the calendar page and its tests.

export const STAFF_SCHEDULE_RETENTION_DAYS = 90;

export interface StaffMember {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  location_id?: string | null;
}

export interface StaffShift {
  id: string;
  staff_member_id: string | null;
  shift_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM (24h)
  end_time: string; // HH:MM (24h)
}

// --- dates: noon-local so DST never moves the calendar day -----------------
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`);

export function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function addDays(iso: string, days: number): string {
  const d = dayOf(iso);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

/** Monday of the week containing `iso` (calendar weeks run Mon → Sun). */
export function weekStart(iso: string): string {
  const d = dayOf(iso);
  const dow = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  d.setDate(d.getDate() - dow);
  return isoDay(d);
}

/** The 7 ISO dates of the week starting at `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "Mon 5 Oct" style label for a day column header. */
export function dayLabel(iso: string): string {
  return dayOf(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** 24h "17:30" → "5:30 PM" for the calendar cards. */
export function formatTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return hhmm || "";
  const h = Number(m[1]);
  const min = m[2];
  if (!Number.isFinite(h) || h > 23) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
}

/** "9:00 AM – 5:00 PM" — the card label. */
export const shiftLabel = (start: string, end: string): string =>
  `${formatTime(start)} – ${formatTime(end)}`;

/** End must be after start — both parse as HH:MM. */
export function isValidShift(start: string, end: string): boolean {
  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? "").trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const s = toMin(start);
  const e = toMin(end);
  return s !== null && e !== null && e > s;
}

/** Group shifts by their day: Monday-first, only days that carry shifts. */
export function shiftsByDay(shifts: readonly StaffShift[], days: readonly string[]): Record<string, StaffShift[]> {
  const out: Record<string, StaffShift[]> = {};
  for (const day of days) out[day] = [];
  for (const s of shifts) {
    if (out[s.shift_date]) out[s.shift_date].push(s);
  }
  for (const day of Object.keys(out)) {
    out[day].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time));
  }
  return out;
}

/** Shifts belonging to one person (staff tablet: "my schedule"). */
export const shiftsFor = (shifts: readonly StaffShift[], memberId: string | null): StaffShift[] =>
  memberId ? shifts.filter((s) => s.staff_member_id === memberId) : [...shifts];

/** Inside the 90-day retention window (cutoff ≤ date ≤ today)? */
export function withinRetention(date: string, today: string): boolean {
  const cutoff = addDays(today, -(STAFF_SCHEDULE_RETENTION_DAYS - 1));
  return date >= cutoff && date <= today;
}
