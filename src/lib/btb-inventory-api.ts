// Pure request-validation and authorization helpers for the BTB inventory
// API routes. No I/O, no Supabase — everything here is unit-tested in
// tests/btb-inventory-api.test.ts. Routes stay thin: parse cookie → resolve
// role server-side → delegate validation here → perform the write.
//
// Authorization is enforced from the SERVER-RESOLVED BTB role (from the
// session cookie), never from a client-supplied role value. The role matrix
// mirrors src/lib/btb-access.ts: month_end_inventory is view-ALL / edit
// MGR_ONLY, so writes require manager/admin while reads need any valid role.

import { isMonthKey } from "./month-end-inventory";
import { isInventoryUnit } from "./inventory-master-list";

/** Edit roles for month_end_inventory (mirrors btb-access.ts MGR_ONLY). */
export const MONTH_END_EDIT_ROLES = ["manager", "admin"] as const;
export const INVENTORY_READ_ROLES = ["staff", "supervisor", "manager", "corporate", "owner", "admin"] as const;

export interface AuthDenied {
  ok: false;
  status: 401 | 403;
  error: string;
}
export interface AuthAllowed {
  ok: true;
  role: string;
}
export type AuthResult = AuthAllowed | AuthDenied;

/**
 * Authorize a request from the server-resolved role. `allowed` is the list of
 * roles that may perform the operation.
 */
export function requireRole(role: string | null, allowed: readonly string[]): AuthResult {
  if (!role) return { ok: false, status: 401, error: "unauthenticated" };
  if (!allowed.includes(role)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, role };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseNonNegativeNumber(value: unknown, label: string, max: number): Parsed<number> {
  if (value === "" || value === null || value === undefined) {
    return { ok: false, error: `${label} required` };
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    return { ok: false, error: `invalid ${label}` };
  }
  return { ok: true, value: round2(n) };
}

/**
 * This prototype has one company-wide snapshot per month (count_month is the
 * snapshot primary key), so partial location-scoped writes would make the UI
 * totals disagree with finalization. Reject rather than silently mixing sites.
 */
function rejectLocationScope(body: Record<string, unknown>): Parsed<null> {
  if (body.location_id !== undefined && body.location_id !== null && body.location_id !== "") {
    return { ok: false, error: "location-scoped month-end inventory is not supported" };
  }
  return { ok: true, value: null };
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CountSaveRow {
  item_id: string;
  qty: number;
}
export interface CountSave {
  count_month: string;
  rows: CountSaveRow[];
}

/** Upper bound so a hostile payload can't insert an unbounded row set. */
export const MAX_COUNT_ROWS = 2000;

/**
 * Validate a count-sheet save: month key, unique item ids, and finite,
 * non-negative quantities. Invalid input is rejected — it is never converted
 * to zero, because this endpoint replaces the whole month.
 */
export function parseCountSave(body: unknown): Parsed<CountSave> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isMonthKey(b.count_month)) return { ok: false, error: "invalid month" };

  const location = rejectLocationScope(b);
  if (!location.ok) return location;

  const raw = b.counts;
  if (!Array.isArray(raw)) return { ok: false, error: "counts must be an array" };
  if (raw.length > MAX_COUNT_ROWS) return { ok: false, error: "too many count rows" };

  const rows: CountSaveRow[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const r = (entry ?? {}) as Record<string, unknown>;
    if (!isUuid(r.item_id)) return { ok: false, error: "invalid item_id" };
    if (seen.has(r.item_id)) return { ok: false, error: "duplicate item_id" };
    seen.add(r.item_id);
    const qty = parseNonNegativeNumber(r.qty, "quantity", 9_999_999_999.99);
    if (!qty.ok) return qty;
    rows.push({ item_id: r.item_id, qty: qty.value });
  }
  return { ok: true, value: { count_month: b.count_month, rows } };
}

export interface SummarySave {
  count_month: string;
  sales: number;
}

/**
 * Validate a food-sales summary save. Sales is the one manual figure: it may
 * be a number or numeric string, must be finite and non-negative; blank → 0
 * (matching the previous page behaviour of `nullableAmount(sales) ?? 0`).
 */
export function parseSummarySave(body: unknown): Parsed<SummarySave> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isMonthKey(b.count_month)) return { ok: false, error: "invalid month" };

  const location = rejectLocationScope(b);
  if (!location.ok) return location;

  const raw = b.sales;
  const parsedSales = raw === undefined || raw === null || raw === ""
    ? { ok: true as const, value: 0 }
    : parseNonNegativeNumber(raw, "sales", Number.MAX_SAFE_INTEGER);
  if (!parsedSales.ok) return parsedSales;

  return { ok: true, value: { count_month: b.count_month, sales: parsedSales.value } };
}

export interface NewItem {
  name: string;
  unit: string;
  unit_cost: number;
  position: number | null;
  /** Packets per case from the master workbook; blank on manual items. */
  pack_size: number | null;
  /** Case cost from the master workbook; blank on manual items. */
  case_price: number | null;
}

export const MAX_NAME_LEN = 200;

/** Validate an add-item payload (mirrors the old page insert exactly). */
export function parseNewItem(body: unknown): Parsed<NewItem> {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name required" };
  if (name.length > MAX_NAME_LEN) return { ok: false, error: "name too long" };

  // The unit is the quantity dropdown's value. Anything else would render as a
  // blank cell on the count sheet, so an unknown unit is a rejected request
  // rather than a silently-coerced "ea".
  const rawUnit = typeof b.unit === "string" ? b.unit.trim() : "";
  if (!isInventoryUnit(rawUnit)) return { ok: false, error: "choose a unit from the list" };
  const unit = rawUnit;

  const rawCost = b.unit_cost;
  const parsedCost = rawCost === undefined || rawCost === null || rawCost === ""
    ? { ok: true as const, value: 0 }
    : parseNonNegativeNumber(rawCost, "unit cost", 99_999_999.99);
  if (!parsedCost.ok) return parsedCost;

  // Case/pack are reference data from the master workbook. Blank means "not
  // recorded" (manual items) — stored as NULL, never as a fabricated 0.
  const packSize = parseOptionalNumber(b.pack_size, "pack size", 99_999.999, 3);
  if (!packSize.ok) return packSize;
  const casePrice = parseOptionalNumber(b.case_price, "case price", 99_999_999.99, 2);
  if (!casePrice.ok) return casePrice;

  const location = rejectLocationScope(b);
  if (!location.ok) return location;

  const position =
    typeof b.position === "number" && Number.isInteger(b.position) && b.position >= 0 ? b.position : null;

  return { ok: true, value: { name, unit, unit_cost: parsedCost.value, position, pack_size: packSize.value, case_price: casePrice.value } };
}

/** Optional non-negative number: blank/missing → null, anything else validated. */
function parseOptionalNumber(value: unknown, label: string, max: number, decimals: number): Parsed<number | null> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    return { ok: false, error: `invalid ${label}` };
  }
  const factor = 10 ** decimals;
  const rounded = Math.round(n * factor) / factor;
  // An explicit 0 pack size or case price is meaningless (a case of nothing?);
  // it is stored as missing so the workbook's formula never divides by zero.
  return { ok: true, value: rounded === 0 ? null : rounded };
}

/**
 * Whether an existing row may be edited. The master list is append-only: a
 * protected item keeps its name forever. Unit, category and cost stay
 * correctable, because those are data fixes, not removals.
 */
export function assertEditableItem(current: { name: string; protected?: boolean | null } | null, nextName: string): Parsed<null> {
  if (!current) return { ok: false, error: "item not found" };
  if (current.protected && current.name.trim() !== nextName.trim()) {
    return { ok: false, error: "master inventory items cannot be renamed — add the corrected name as a new item" };
  }
  return { ok: true, value: null };
}

/** Optional manual sales input used by finalization; blank really means null. */
export function parseOptionalSales(value: unknown): Parsed<number | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  return parseNonNegativeNumber(value, "sales", Number.MAX_SAFE_INTEGER);
}

/** Strict calendar-date validation for purchase dates. */
export function isDateInMonth(date: unknown, month: unknown): date is string {
  if (typeof date !== "string" || !isMonthKey(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date.slice(0, 7) !== month) return false;
  const [year, mon, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, mon - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === mon - 1 && parsed.getUTCDate() === day;
}

/** First finalization is v1; every correction/re-finalization increments it. */
export function nextSnapshotVersion(prior: { version?: unknown } | null): number {
  if (!prior) return 1;
  const current = Number(prior.version);
  return Number.isInteger(current) && current >= 1 ? current + 1 : 2;
}
