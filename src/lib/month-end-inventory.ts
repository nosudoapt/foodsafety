// Month-End Inventory — month-key maths, count merging and valuation/variance.
// Pure helpers shared by the closing page and its tests.

export const INVENTORY_RETENTION_MONTHS = 24;

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  category?: string | null;
  unit_cost: number;
  position: number;
  location_id?: string | null;
}

export interface InventoryCount {
  id?: string;
  item_id: string;
  count_month: string; // YYYY-MM
  qty: number;
  counted_by?: string | null;
}

export interface InventoryLine {
  item: InventoryItem;
  qty: number;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (v: unknown): v is string => typeof v === "string" && MONTH_RE.test(v);

/** Local month key for a date ('YYYY-MM') — never UTC-shifted off the day. */
export function monthKey(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return date.slice(0, 7);
}

export const thisMonth = (): string => monthKey(new Date().toISOString().slice(0, 10));

/** Previous closing month: '2026-01' → '2025-12'. */
export function prevMonth(key: string): string {
  if (!isMonthKey(key)) return key;
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonth(key: string): string {
  if (!isMonthKey(key)) return key;
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** '2026-09' → 'Sep 2026'. */
export function monthLabel(key: string): string {
  if (!isMonthKey(key)) return key;
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** The last `count` month keys, newest first (the month picker). */
export function recentMonths(end: string, count: number): string[] {
  const out: string[] = [];
  let key = isMonthKey(end) ? end : thisMonth();
  for (let i = 0; i < count; i++) {
    out.push(key);
    key = prevMonth(key);
  }
  return out;
}

/** Inside the 24-month retention window? */
export function withinRetention(key: string, todayMonth: string): boolean {
  let cutoff = isMonthKey(todayMonth) ? todayMonth : thisMonth();
  for (let i = 0; i < INVENTORY_RETENTION_MONTHS - 1; i++) cutoff = prevMonth(cutoff);
  return isMonthKey(key) && key >= cutoff && key <= todayMonth;
}

// --- numbers ---------------------------------------------------------------
/** Free-typed qty → a rounded number (junk → 0). */
export function countQty(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** qty × unit cost, rounded to cents. */
export const lineValue = (qty: number, unitCost: number): number =>
  Math.round(countQty(qty) * Math.max(0, Number(unitCost) || 0) * 100) / 100;

/** Every line's value added up — the closing inventory value. */
export const totalValue = (lines: readonly InventoryLine[]): number =>
  Math.round(lines.reduce((sum, l) => sum + lineValue(l.qty, l.item.unit_cost), 0) * 100) / 100;

/** Item list + stored counts → ordered lines with quantities (0 when uncounted). */
export function toLines(items: readonly InventoryItem[], counts: readonly InventoryCount[]): InventoryLine[] {
  const qtyBy = new Map(counts.map((c) => [c.item_id, countQty(c.qty)]));
  return [...items]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((item) => ({ item, qty: qtyBy.get(item.id) ?? 0 }));
}

/** Current minus previous; pct is 0 when the previous value was 0. */
export function variance(current: number, previous: number): { delta: number; pct: number } {
  const c = countQty(current);
  const p = countQty(previous);
  const delta = Math.round((c - p) * 100) / 100;
  const pct = p === 0 ? 0 : Math.round(((c - p) / p) * 1000) / 10; // one decimal
  return { delta, pct };
}

/** Counts from a stored month, keyed by item. */
export function countsByItem(counts: readonly InventoryCount[]): Map<string, number> {
  return new Map(counts.map((c) => [c.item_id, countQty(c.qty)]));
}
