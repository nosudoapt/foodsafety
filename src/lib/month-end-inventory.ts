// Month-End Inventory — month-key maths, count merging and valuation/variance.
// Pure helpers shared by the closing page and its tests.

export const INVENTORY_RETENTION_MONTHS = 24;

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  /** Pack size printed on the master sheet ("2.27 kg", "1/9 D"). Reference only. */
  unit_size?: string | null;
  category?: string | null;
  unit_cost: number;
  position: number;
  location_id?: string | null;
  /**
   * Seeded from the owner's master workbook. The name is permanent: the item
   * can be counted, re-priced or re-categorised, never renamed or removed.
   */
  protected?: boolean;
  /** GFS item number from the workbook. Reference only. */
  item_number?: number | null;
  /** Packets per case from the workbook ("Pack size"). */
  pack_size?: number | null;
  /** Case cost from the workbook ("Case price"). Packet = case ÷ pack. */
  case_price?: number | null;
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

/**
 * The cost that applies to what the crew actually counts. An item counted in
 * whole cases is worth its case price; everything else uses its stored unit
 * cost (for master items that is packet = case ÷ pack).
 */
export function itemUnitCost(item: Pick<InventoryItem, "unit" | "unit_cost" | "case_price">): number {
  const casePrice = Number(item.case_price);
  if (item.unit === "case" && Number.isFinite(casePrice) && casePrice > 0) {
    return Math.round(casePrice * 100) / 100;
  }
  const cost = Number(item.unit_cost);
  return Number.isFinite(cost) && cost > 0 ? Math.round(cost * 100) / 100 : 0;
}

/** Packet (per counted unit) from the case price and pack size — the workbook's formula. */
export function packetPrice(casePrice: number | null | undefined, packSize: number | null | undefined): number | null {
  const price = Number(casePrice);
  const pack = Number(packSize);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pack) || pack <= 0) return null;
  return Math.round((price / pack) * 100) / 100;
}

/** Line value for one counted item, honouring its count basis. */
export const countLineValue = (item: InventoryItem, qty: number): number =>
  lineValue(qty, itemUnitCost(item));

/** Every line's value added up — the closing inventory value. */
export const totalValue = (lines: readonly InventoryLine[]): number =>
  Math.round(lines.reduce((sum, l) => sum + countLineValue(l.item, l.qty), 0) * 100) / 100;

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
/** Carry-forward: previous month's closing value becomes next month's opening. */
export function carryForwardOpening(previousClosing: number): number {
  return Math.round(Math.max(0, countQty(previousClosing)) * 100) / 100;
}

export function countsByItem(counts: readonly InventoryCount[]): Map<string, number> {
  return new Map(counts.map((c) => [c.item_id, countQty(c.qty)]));
}

// --- month math ------------------------------------------------------------
// Closing comes from the count sheet itself:
//   usage = opening + purchases − closing · food cost % = usage ÷ sales.
export interface MonthSummary {
  opening_value: number;
  purchases: number;
  sales: number;
}

/** Food used in the month ($): opening + purchases − closing. Never negative. */
export function usageValue(opening: number, purchases: number, closing: number): number {
  return Math.round((Math.max(0, countQty(opening)) + Math.max(0, countQty(purchases)) - Math.max(0, countQty(closing))) * 100) / 100;
}

/** Food cost % = usage ÷ sales × 100. 0 when sales are 0. One decimal. */
export function foodCostPct(opening: number, purchases: number, closing: number, sales: number): number {
  const usage = usageValue(opening, purchases, closing);
  const s = Math.max(0, countQty(sales));
  if (s === 0) return 0;
  return Math.round((usage / s) * 1000) / 10;
}
