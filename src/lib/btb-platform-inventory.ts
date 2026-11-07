// Shared, secret-free contracts for the inventory & food-cost module.
// Imported by both the API route and the browser screen.

export interface InventoryItem {
  id: string;
  name: string;
  item_number: string | null;
  source: "gfs" | "local";
  unit: string;
  unit_size: string | null;
  pack_size: number | null;
  category: string | null;
  unit_cost: number | null;
  case_price: number | null;
  packet_price: number | null;
  par_value: number | null;
}

export interface InventoryCount {
  item_id: string;
  count_month: string;
  cases: number | null;
  packets: number | null;
  line_value: number | null;
  counted_by: string | null;
}

export interface InventoryPurchase {
  id: string;
  count_month: string;
  purchase_date: string;
  type: "gfs" | "local";
  supplier: string;
  amount: number;
  reference: string | null;
  description: string | null;
  voided_at: string | null;
}

export interface InventoryImport {
  id: string;
  kind: "gfs" | "local" | "sales" | "master";
  status: "review" | "confirmed" | "rejected";
  accounting_month: string;
  extractor: string;
  extraction_error: string | null;
  raw_text: string;
  extracted_data: Record<string, unknown>;
  review_data: Record<string, unknown> | null;
  created_at: string;
  confirmed_at: string | null;
  file_id: string;
  sha256: string;
}

export interface InventorySummary {
  opening_value: number | null;
  opening_confirmed: boolean;
  opening_reason: string | null;
  purchases_confirmed: boolean;
  sales_confirmed: boolean;
  sales: number | null;
  sales_basis: string | null;
  sales_figures: { label: string; value: number }[] | null;
  sales_document_id: string | null;
  version: number;
}

export interface InventorySnapshot {
  count_month: string;
  opening_value: number | null;
  closing_value: number | null;
  purchases: number | null;
  gfs_purchases: number | null;
  local_purchases: number | null;
  sales: number | null;
  cogs: number | null;
  food_cost_pct: number | null;
  status: "draft" | "finalized";
  sales_basis: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  version: number;
}

export interface InventoryAudit {
  id: number;
  action: string;
  actor: string;
  reason: string | null;
  created_at: string;
}

export interface InventoryData {
  items: InventoryItem[];
  counts: InventoryCount[];
  purchases: InventoryPurchase[];
  purchase_lines: {
    id: string;
    purchase_id: string;
    item_id: string | null;
    description: string;
    item_code: string | null;
    cases: number;
    packets: number;
    unit_price: number | null;
    line_total: number | null;
  }[];
  imports: InventoryImport[];
  summary: InventorySummary | null;
  snapshot: InventorySnapshot | null;
  previous: InventorySnapshot | null;
  settings: { sales_basis: string } | null;
  audit: InventoryAudit[];
}

/** The single sales basis the client confirmed. Never guess another one. */
export const SALES_BASIS = "Summary Total Net Sales";

export interface FoodCostResult {
  /** Purchases, or null when no purchase figure exists. Never a fabricated 0. */
  purchases: number | null;
  /** COGS, or null when any of opening/purchases/closing is missing. */
  cogs: number | null;
  /** Food cost %, or null when net sales is missing or not positive. */
  foodCostPct: number | null;
  /** Human-readable names of the inputs that are unavailable, in formula order. */
  missing: string[];
}

const isAmount = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * COGS = opening + purchases − closing.
 * Food cost % = COGS / net sales × 100.
 *
 * A missing input is reported as missing and makes the dependent result null;
 * it is never treated as zero. Net sales being missing (or non-positive) only
 * withholds the percentage — COGS is still a valid figure without it.
 */
export function foodCost(
  opening: number | null | undefined,
  purchases: number | null | undefined,
  closing: number | null | undefined,
  netSales: number | null | undefined,
): FoodCostResult {
  const missing: string[] = [];
  if (!isAmount(opening)) missing.push("opening inventory");
  if (!isAmount(purchases)) missing.push("purchases");
  if (!isAmount(closing)) missing.push("closing inventory");
  if (!isAmount(netSales)) missing.push("net sales");

  const cogs = isAmount(opening) && isAmount(purchases) && isAmount(closing)
    ? round2(opening + purchases - closing)
    : null;

  const pct = cogs !== null && isAmount(netSales) && netSales > 0
    ? round2((cogs / netSales) * 100)
    : null;

  return { purchases: isAmount(purchases) ? purchases : null, cogs, foodCostPct: pct, missing };
}

/** One labelled figure as it appears on the POS report. */
export interface SalesFigure { label: string; value: number }

/**
 * Total the reviewed POS figures for the confirmed sales basis.
 *
 * The basis label must appear exactly once — a POS report that repeats the
 * label, or omits it, is ambiguous and must be corrected by a person rather
 * than silently summed. Returns null when the figures cannot be used.
 */
export function salesTotal(figures: readonly SalesFigure[] | null | undefined, basis: string): number | null {
  if (!Array.isArray(figures) || !basis) return null;
  const matches = figures.filter((row) => row.label === basis);
  if (matches.length !== 1) return null;
  const value = matches[0].value;
  return Number.isFinite(value) && value > 0 ? round2(value) : null;
}

export const INVENTORY_ACTIONS = [
  "items",
  "confirm_master",
  "reject_import",
  "confirm_purchase",
  "void_purchase",
  "counts",
  "inputs",
  "confirm_sales",
  "finalize",
  "reopen",
] as const;
export type InventoryAction = (typeof INVENTORY_ACTIONS)[number];

/** Accounting month key in the location's own reporting day (YYYY-MM). */
export function btbMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Regina", year: "numeric", month: "2-digit" })
    .format(now).replace("/", "-").slice(0, 7);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Move an accounting month by whole months, e.g. shiftMonth("2026-01", -1). */
export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, index - 1, 1)));
}

/**
 * Currency display. A missing amount is the word "Missing", never $0.00 —
 * an unknown figure and a real zero must not look alike.
 */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Missing";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value));
}

/**
 * Strict non-negative decimal. A blank field is `null` (missing), not 0, so a
 * half-typed count can never be saved as a real zero. Anything else is null
 * and callers show an explicit validation message.
 */
export function parseQuantity(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Value of one counted line: cases × case price + packets × packet price.
 * Every input must be present; a missing price or count returns null rather
 * than valuing the line at zero.
 */
export function lineValue(
  cases: number | null | undefined,
  packets: number | null | undefined,
  casePrice: number | null | undefined,
  packetPrice: number | null | undefined,
): number | null {
  const numbers = [cases, packets, casePrice, packetPrice];
  if (numbers.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  return round2(cases! * casePrice! + packets! * packetPrice!);
}

/** Sum of counted lines; null when any counted line cannot be valued. */
export function closingValue(lines: readonly { value: number | null }[]): number | null {
  if (lines.length === 0) return null;
  if (lines.some((line) => line.value === null)) return null;
  return round2(lines.reduce((total, line) => total + (line.value ?? 0), 0));
}

// --- reading untrusted extraction output -------------------------------------
// A document extraction is an untrusted suggestion: it comes from a scanned
// invoice, so every field may be absent or a string. These helpers never
// invent a value and never coerce junk into a number.
export function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Row objects from an extracted array, dropping anything that is not an object. */
export function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row),
  );
}

/** A reviewed purchase line, normalised from extraction or a hand-typed cell. */
export interface PurchaseLineDraft {
  item_id: string | null;
  description: string;
  item_code: string | null;
  cases: string;
  packets: string;
  unit_price: string;
  line_total: string;
}

export function purchaseLineDraft(row: Record<string, unknown> = {}): PurchaseLineDraft {
  const qty = (key: string): string => {
    const n = numberOf(row[key]);
    return n === null ? "" : String(n);
  };
  return {
    item_id: textOf(row.item_id) || null,
    description: textOf(row.description),
    item_code: textOf(row.item_code) || null,
    cases: qty("cases"),
    packets: qty("packets"),
    unit_price: qty("unit_price"),
    line_total: qty("line_total"),
  };
}

/**
 * Validate the reviewed purchase lines before they are sent to SQL.
 * Returns the first problem as a human sentence, or null when every line is
 * complete. A line with a blank total is not silently zero.
 */
export function purchaseLinesProblem(lines: readonly PurchaseLineDraft[]): string | null {
  for (const [index, line] of lines.entries()) {
    const where = `Line ${index + 1}`;
    if (!line.description.trim()) return `${where}: enter an item description.`;
    const cases = parseQuantity(line.cases);
    const packets = parseQuantity(line.packets);
    if (cases === null) return `${where}: enter cases (0 if none).`;
    if (packets === null) return `${where}: enter packets (0 if none).`;
    // A line with no quantity needs no price, but a line someone counted must
    // carry its confirmed total; a blank total is missing, never zero.
    if (cases > 0 || packets > 0) {
      if (parseQuantity(line.line_total) === null) {
        return `${where}: enter the confirmed line total.`;
      }
      if (line.unit_price.trim() !== "" && parseQuantity(line.unit_price) === null) {
        return `${where}: the unit price is not a number.`;
      }
    }
  }
  return null;
}

/** One prerequisite shown in the month's readiness strip. */
export interface ReadinessStep {
  key: "opening" | "catalog" | "purchases" | "sales" | "closing" | "review" | "finalized";
  label: string;
  done: boolean;
  detail: string;
}

/**
 * Translate the month's persisted state into the prerequisites the SQL
 * finalize step enforces auditing. Nothing here decides authorisation; it only
 * tells the manager which real record is still missing.
 */
export function inventoryReadiness(data: InventoryData): ReadinessStep[] {
  const items = data.items ?? [];
  const counts = data.counts ?? [];
  const imports = data.imports ?? [];
  const summary = data.summary;
  const snapshot = data.snapshot;

  const priced = items.filter(
    (item) => item.pack_size != null && item.case_price != null && item.packet_price != null,
  );
  const counted = items.filter((item) =>
    counts.some((count) => count.item_id === item.id && count.line_value != null),
  );
  const unreviewed = imports.filter((row) => row.status === "review");
  const opening =
    data.previous?.status === "finalized"
      ? `Carried from ${data.previous.count_month} closing ${money(data.previous.closing_value)}`
      : summary?.opening_confirmed
        ? "Baseline opening confirmed with a source explanation"
        : "No finalized previous month and no confirmed baseline yet";

  return [
    {
      key: "opening",
      label: "Opening inventory",
      done: data.previous?.status === "finalized" || !!summary?.opening_confirmed,
      detail: opening,
    },
    {
      key: "catalog",
      label: "Item catalogue",
      done: items.length > 0 && priced.length === items.length,
      detail: items.length === 0
        ? "No items yet — import the master inventory list"
        : priced.length === items.length
          ? `${items.length} items with case, packet and pack conversion`
          : `${items.length - priced.length} of ${items.length} items missing a price or pack size`,
    },
    {
      key: "purchases",
      label: "Purchases",
      done: !!summary?.purchases_confirmed,
      detail: summary?.purchases_confirmed
        ? "This month's purchases are confirmed complete"
        : "Confirm purchases once every invoice and receipt is entered",
    },
    {
      key: "sales",
      label: "Net sales",
      done: !!summary?.sales_confirmed && (summary.sales ?? 0) > 0,
      detail: summary?.sales_confirmed
        ? `${summary.sales_basis ?? SALES_BASIS} · ${money(summary.sales)}`
        : "Enter the reviewed POS sales figure",
    },
    {
      key: "closing",
      label: "Closing counts",
      done: items.length > 0 && counted.length === items.length,
      detail: items.length === 0
        ? "No items to count"
        : `${counted.length} of ${items.length} items counted in cases and packets`,
    },
    {
      key: "review",
      label: "Document review",
      done: unreviewed.length === 0,
      detail: unreviewed.length === 0
        ? "No unreviewed documents remain this month"
        : `${unreviewed.length} document${unreviewed.length === 1 ? "" : "s"} still awaiting review`,
    },
    {
      key: "finalized",
      label: "Finalized",
      done: snapshot?.status === "finalized",
      detail: snapshot?.status === "finalized"
        ? `Finalized by ${snapshot.finalized_by ?? "unknown"} at ${snapshot.finalized_at ?? ""}`.trim()
        : "Not finalized yet",
    },
  ];
}
