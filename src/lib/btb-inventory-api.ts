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
import { safeQty } from "./inventory-accounting";

/** Edit roles for month_end_inventory (mirrors btb-access.ts MGR_ONLY). */
export const MONTH_END_EDIT_ROLES = ["manager", "admin"] as const;

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

/** Accept a UUID or null/absent; anything else is invalid. */
function parseLocationId(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (isUuid(v)) return { ok: true, value: v };
  return { ok: false, error: "invalid location_id" };
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CountSaveRow {
  item_id: string;
  qty: number;
}
export interface CountSave {
  count_month: string;
  rows: CountSaveRow[];
  location_id: string | null;
}

/** Upper bound so a hostile payload can't insert an unbounded row set. */
export const MAX_COUNT_ROWS = 2000;

/**
 * Validate a count-sheet save: month key, item ids, quantities (junk/negative
 * → 0 via safeQty, same rule the UI used), optional location.
 */
export function parseCountSave(body: unknown): Parsed<CountSave> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isMonthKey(b.count_month)) return { ok: false, error: "invalid month" };

  const loc = parseLocationId(b.location_id);
  if (!loc.ok) return loc;

  const raw = b.counts;
  if (!Array.isArray(raw)) return { ok: false, error: "counts must be an array" };
  if (raw.length > MAX_COUNT_ROWS) return { ok: false, error: "too many count rows" };

  const rows: CountSaveRow[] = [];
  for (const entry of raw) {
    const r = (entry ?? {}) as Record<string, unknown>;
    if (!isUuid(r.item_id)) return { ok: false, error: "invalid item_id" };
    rows.push({ item_id: r.item_id, qty: safeQty(r.qty) });
  }
  return { ok: true, value: { count_month: b.count_month, rows, location_id: loc.value } };
}

export interface SummarySave {
  count_month: string;
  sales: number;
  location_id: string | null;
}

/**
 * Validate a food-sales summary save. Sales is the one manual figure: it may
 * be a number or numeric string, must be finite and non-negative; blank → 0
 * (matching the previous page behaviour of `nullableAmount(sales) ?? 0`).
 */
export function parseSummarySave(body: unknown): Parsed<SummarySave> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isMonthKey(b.count_month)) return { ok: false, error: "invalid month" };

  const loc = parseLocationId(b.location_id);
  if (!loc.ok) return loc;

  const raw = b.sales;
  const sales = raw === undefined || raw === null || raw === "" ? 0 : safeQty(raw);
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isFinite(Number(raw))) {
    return { ok: false, error: "invalid sales" };
  }
  if (typeof raw === "number" && !Number.isFinite(raw)) return { ok: false, error: "invalid sales" };
  if (sales < 0) return { ok: false, error: "invalid sales" };

  return { ok: true, value: { count_month: b.count_month, sales, location_id: loc.value } };
}

export interface NewItem {
  name: string;
  unit: string;
  unit_cost: number;
  position: number | null;
  location_id: string | null;
}

export const MAX_NAME_LEN = 200;

/** Validate an add-item payload (mirrors the old page insert exactly). */
export function parseNewItem(body: unknown): Parsed<NewItem> {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name required" };
  if (name.length > MAX_NAME_LEN) return { ok: false, error: "name too long" };

  const unit = typeof b.unit === "string" && b.unit.trim() ? b.unit.trim() : "ea";
  const unitCost = safeQty(b.unit_cost); // junk/negative → 0, as before

  const loc = parseLocationId(b.location_id);
  if (!loc.ok) return loc;

  const position =
    typeof b.position === "number" && Number.isInteger(b.position) && b.position >= 0 ? b.position : null;

  return { ok: true, value: { name, unit, unit_cost: unitCost, position, location_id: loc.value } };
}
