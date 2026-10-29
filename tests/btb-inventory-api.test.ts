import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MONTH_END_EDIT_ROLES,
  isUuid,
  parseCountSave,
  parseNewItem,
  parseSummarySave,
  requireRole,
  MAX_COUNT_ROWS,
} from "../src/lib/btb-inventory-api";

// ---------------------------------------------------------------------------
// Authorization: the server-resolved BTB role decides, never the request body.
// month_end_inventory is view-ALL / edit-MGR_ONLY (src/lib/btb-access.ts).
// ---------------------------------------------------------------------------

const ALL = ["staff", "supervisor", "manager", "corporate", "admin"];
const UUID = "3f1d2a4c-9b8e-4f70-a1c2-3d4e5f607182";

test("requireRole: no role → 401", () => {
  const r = requireRole(null, MONTH_END_EDIT_ROLES);
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 401); assert.equal(r.error, "unauthenticated"); }
});

test("requireRole: staff forbidden from edit operations", () => {
  const r = requireRole("staff", MONTH_END_EDIT_ROLES);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});

test("requireRole: supervisor also forbidden (edit is MGR_ONLY)", () => {
  // Regression: the old browser-direct writes had NO server check at all.
  assert.equal(requireRole("supervisor", MONTH_END_EDIT_ROLES).ok, false);
  assert.equal(requireRole("corporate", MONTH_END_EDIT_ROLES).ok, false);
});

test("requireRole: manager and admin allowed", () => {
  assert.equal(requireRole("manager", MONTH_END_EDIT_ROLES).ok, true);
  assert.equal(requireRole("admin", MONTH_END_EDIT_ROLES).ok, true);
});

test("requireRole: any of the five roles may read", () => {
  for (const role of ALL) assert.equal(requireRole(role, ALL).ok, true);
});

test("requireRole: a forged role string not in the list is rejected", () => {
  assert.equal(requireRole("root", ALL).ok, false);
  assert.equal(requireRole("", ALL).ok, false);
});

test("isUuid accepts v4-ish ids and rejects junk", () => {
  assert.equal(isUuid(UUID), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(`${UUID}; DROP TABLE`), false);
  assert.equal(isUuid(42), false);
  assert.equal(isUuid(null), false);
});

// ---------------------------------------------------------------------------
// Count-sheet save validation
// ---------------------------------------------------------------------------

test("parseCountSave: valid payload passes with clamped quantities", () => {
  const p = parseCountSave({
    count_month: "2026-08",
    counts: [
      { item_id: UUID, qty: 3 },
      { item_id: UUID, qty: "-4" },   // negative → 0 (safeQty)
      { item_id: UUID, qty: "junk" }, // junk → 0
    ],
    location_id: null,
  });
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.equal(p.value.count_month, "2026-08");
    assert.equal(p.value.rows.length, 3);
    assert.equal(p.value.rows[0].qty, 3);
    assert.equal(p.value.rows[1].qty, 0);
    assert.equal(p.value.rows[2].qty, 0);
    assert.equal(p.value.location_id, null);
  }
});

test("parseCountSave: invalid month rejected", () => {
  assert.equal(parseCountSave({ count_month: "2026-13", counts: [] }).ok, false);
  assert.equal(parseCountSave({ counts: [] }).ok, false);
  assert.equal(parseCountSave(null).ok, false);
});

test("parseCountSave: non-array or invalid item_id rejected", () => {
  assert.equal(parseCountSave({ count_month: "2026-08", counts: "x" }).ok, false);
  assert.equal(parseCountSave({ count_month: "2026-08", counts: [{ item_id: "nope", qty: 1 }] }).ok, false);
});

test("parseCountSave: oversized payload rejected", () => {
  const counts = Array.from({ length: MAX_COUNT_ROWS + 1 }, () => ({ item_id: UUID, qty: 1 }));
  assert.equal(parseCountSave({ count_month: "2026-08", counts }).ok, false);
});

test("parseCountSave: non-uuid location_id rejected, uuid accepted", () => {
  assert.equal(parseCountSave({ count_month: "2026-08", counts: [], location_id: "evil" }).ok, false);
  assert.equal(parseCountSave({ count_month: "2026-08", counts: [], location_id: UUID }).ok, true);
});

// ---------------------------------------------------------------------------
// Sales summary validation
// ---------------------------------------------------------------------------

test("parseSummarySave: numbers and numeric strings accepted", () => {
  for (const sales of [12000, "12000", 12000.55, "", null, undefined]) {
    const p = parseSummarySave({ count_month: "2026-08", sales });
    assert.equal(p.ok, true, `sales=${String(sales)} should pass`);
    if (p.ok && (sales === "" || sales == null)) assert.equal(p.value.sales, 0);
  }
});

test("parseSummarySave: junk sales rejected (never silently zero from garbage)", () => {
  assert.equal(parseSummarySave({ count_month: "2026-08", sales: "abc" }).ok, false);
  assert.equal(parseSummarySave({ count_month: "2026-08", sales: NaN }).ok, false);
  assert.equal(parseSummarySave({ count_month: "2026-08", sales: Infinity }).ok, false);
});

test("parseSummarySave: invalid month rejected", () => {
  assert.equal(parseSummarySave({ count_month: "bad", sales: 1 }).ok, false);
});

// ---------------------------------------------------------------------------
// Add-item validation
// ---------------------------------------------------------------------------

test("parseNewItem: mirrors the old page insert (unit default, cost clamp)", () => {
  const p = parseNewItem({ name: "  Sesame buns  ", unit: "", unit_cost: "-3" });
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.equal(p.value.name, "Sesame buns");
    assert.equal(p.value.unit, "ea");
    assert.equal(p.value.unit_cost, 0); // negative → 0, as countQty did before
    assert.equal(p.value.position, null);
  }
});

test("parseNewItem: blank or oversized name rejected", () => {
  assert.equal(parseNewItem({ name: "   " }).ok, false);
  assert.equal(parseNewItem({}).ok, false);
  assert.equal(parseNewItem({ name: "x".repeat(201) }).ok, false);
});

test("parseNewItem: position must be a non-negative integer to be honoured", () => {
  const p = parseNewItem({ name: "buns", position: 7 });
  assert.equal(p.ok && p.value.position, 7);
  const q = parseNewItem({ name: "buns", position: -1 });
  assert.equal(q.ok && q.value.position, null);
});
