import { prepColumns } from "./btb-prep-list";

/** The prep sheet keeps 45 days of history, not a week. */
export const PREP_HISTORY_DAYS = 45;

/** Section names exactly as printed: Produce, Starches, Sauces, Meats, Freezer pull, Dairy. */
export const PREP_CATEGORIES: readonly string[] = prepColumns.flatMap((column) => column.sections.map((section) => section.title));

export function isPrepCategory(value: unknown): value is string {
  return typeof value === "string" && PREP_CATEGORIES.includes(value) && value.length <= 60;
}

/** A section is "par" when the sheet prints Unit/Par/OH/Make; "pull" only has OH/Pull. */
export function prepCategoryMode(category: string): "par" | "pull" {
  for (const column of prepColumns) {
    if (column.sections.some((section) => section.title === category)) return column.mode;
  }
  return "par";
}

/** Catalog rows for one section, keyed exactly as prep_counts stores them. */
export function prepCategoryItems(category: string): { key: string; name: string; unit: string }[] {
  for (const column of prepColumns) {
    for (const section of column.sections) {
      if (section.title !== category) continue;
      return section.items.map((item) => ({ key: item.key ?? item.name, name: item.name, unit: item.unit ?? "" }));
    }
  }
  return [];
}

/**
 * The seven-day window a manager is setting PAR levels for.
 *
 * Weeks start on Friday, so Friday's set-up covers Friday through Thursday.
 * Pure and UTC-based so the server and the browser agree regardless of the
 * device timezone.
 */
export function parWeekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) throw new Error("Choose a valid date.");
  const sinceFriday = (day.getUTCDay() + 2) % 7; // Fri=0 … Thu=6
  day.setUTCDate(day.getUTCDate() - sinceFriday);
  return day.toISOString().slice(0, 10);
}

/** Who may see a section: managers and their seniors see every section, staff only their own. */
export function visiblePrepCategories(role: string, assigned: readonly string[]): string[] {
  if (["manager", "supervisor", "owner", "corporate"].includes(role)) return [...PREP_CATEGORIES];
  return PREP_CATEGORIES.filter((category) => assigned.includes(category));
}

/** Staff never see PAR; a manager keeps it to plan the make quantity. */
export function canSeePrepPar(role: string): boolean {
  return ["manager", "supervisor", "owner", "corporate"].includes(role);
}

export interface PrepSubmitRow {
  key: string;
  done: boolean;
}

/** A submission is complete only when every visible row is ticked. */
export function prepSubmitState(rows: readonly PrepSubmitRow[]): { complete: boolean; missing: number } {
  const missing = rows.filter((row) => !row.done).length;
  return { complete: rows.length > 0 && missing === 0, missing };
}

/** The one-line message a manager sees in-app after a submission. */
export function prepSubmissionNotice(name: string, categories: readonly string[], missing: number): string {
  const where = categories.length ? categories.join(", ") : "no sections";
  return missing === 0
    ? `${name} submitted ${where}: everything is complete.`
    : `${name} submitted ${where} with ${missing} item${missing === 1 ? "" : "s"} not ticked.`;
}
