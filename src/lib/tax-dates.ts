// Corporate / tax dates — due-date status, sorting and the roll-forward that
// turns a one-off deadline into the next one it repeats on. Pure helpers
// shared by the page and its tests.

export const DATE_CATEGORIES = ["tax", "payroll", "licence", "insurance", "other"] as const;
export type DateCategory = (typeof DATE_CATEGORIES)[number];

export const RECURRENCES = ["none", "monthly", "quarterly", "annual"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export interface CorporateDate {
  id: string;
  title: string;
  category: string;
  due_date: string; // YYYY-MM-DD
  recurrence: string;
  notes?: string | null;
  created_by?: string | null;
  location_id?: string | null;
}

/** Days until `due` relative to `today` (negative = already past). */
export function daysUntil(due: string, today: string): number {
  const d = new Date(`${due}T12:00:00`).getTime();
  const t = new Date(`${today}T12:00:00`).getTime();
  if (!Number.isFinite(d) || !Number.isFinite(t)) return Number.NaN;
  return Math.round((d - t) / 86_400_000);
}

/** overdue (<0) · soon (0-7 days) · upcoming (>7 days). */
export function dueStatus(due: string, today: string): "overdue" | "soon" | "upcoming" {
  const n = daysUntil(due, today);
  if (!Number.isFinite(n)) return "upcoming";
  if (n < 0) return "overdue";
  return n <= 7 ? "soon" : "upcoming";
}

/** Nearest deadline first; ties break alphabetically so the list never jitters. */
export function sortDates(rows: readonly CorporateDate[], today: string): CorporateDate[] {
  return [...rows].sort((a, b) => {
    const d = daysUntil(a.due_date, today) - daysUntil(b.due_date, today);
    if (d !== 0 && Number.isFinite(d)) return d;
    if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

// --- recurrence ------------------------------------------------------------
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`);

function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Add whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const d = dayOf(iso);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(day, last));
  return isoDay(target);
}

const STEP: Record<Recurrence, number> = { none: 0, monthly: 1, quarterly: 3, annual: 12 };

export function isRecurrence(v: unknown): v is Recurrence {
  return typeof v === "string" && (RECURRENCES as readonly string[]).includes(v);
}

/**
 * The next date this deadline lands on, at or after `today`. A one-off
 * ("none") simply returns its own due date.
 */
export function nextOccurrence(due: string, recurrence: string, today: string): string {
  if (!isRecurrence(recurrence) || recurrence === "none") return due;
  if (due >= today) return due;
  const step = STEP[recurrence];
  let next = due;
  // Always step from the original anchor so a "31st" deadline stays on the
  // 31st instead of drifting to 30 then 29 (<=24 hops of safety).
  for (let i = 1; i <= 24 && next < today; i++) next = addMonths(due, step * i);
  return next;
}

export function isCategory(v: unknown): v is DateCategory {
  return typeof v === "string" && (DATE_CATEGORIES as readonly string[]).includes(v);
}

export const CATEGORY_LABEL: Record<DateCategory, string> = {
  tax: "Tax return",
  payroll: "Payroll remittance",
  licence: "Licence / permit",
  insurance: "Insurance",
  other: "Other",
};

export const categoryLabel = (v: string): string =>
  isCategory(v) ? CATEGORY_LABEL[v] : v.charAt(0).toUpperCase() + v.slice(1);

export function isCategoryAccent(v: string): "red" | "amber" | "purple" | "green" | "slate" {
  if (v === "tax") return "red";
  if (v === "payroll") return "amber";
  if (v === "licence") return "purple";
  if (v === "insurance") return "green";
  return "slate";
}

/** "12 Mar 2026" for the list rows. */
export function prettyDate(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
