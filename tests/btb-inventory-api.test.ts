import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MONTH_END_EDIT_ROLES,
  assertEditableItem,
  isDateInMonth,
  isUuid,
  nextSnapshotVersion,
  parseCountSave,
  parseNewItem,
  parseOptionalSales,
  parseSummarySave,
  requireRole,
  MAX_COUNT_ROWS,
} from "../src/lib/btb-inventory-api";
import { INVENTORY_UNIT_VALUES } from "../src/lib/inventory-master-list";

// ---------------------------------------------------------------------------
// Authorization: the server-resolved BTB role decides, never the request body.
// month_end_inventory is view-ALL / edit-MGR_ONLY (src/lib/btb-access.ts).
// ---------------------------------------------------------------------------

const ALL = ["staff", "supervisor", "manager", "corporate", "owner", "admin"];
const UUID = "3f1d2a4c-9b8e-4f70-a1c2-3d4e5f607182";
const UUID_2 = "4f1d2a4c-9b8e-4f70-a1c2-3d4e5f607183";

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

test("requireRole: any signed-in BTB role may read (owner included — regression: the owner hub card failed its data load)", () => {
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

test("parseCountSave: valid payload passes and rounds quantities", () => {
  const p = parseCountSave({
    count_month: "2026-08",
    counts: [
      { item_id: UUID, qty: 3 },
      { item_id: UUID_2, qty: "4.126" },
    ],
  });
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.equal(p.value.count_month, "2026-08");
    assert.equal(p.value.rows.length, 2);
    assert.equal(p.value.rows[0].qty, 3);
    assert.equal(p.value.rows[1].qty, 4.13);
  }
});

test("parseCountSave: negative/junk/missing quantities are rejected, never zeroed", () => {
  for (const qty of [-1, "-4", "junk", "", null, undefined]) {
    assert.equal(parseCountSave({ count_month: "2026-08", counts: [{ item_id: UUID, qty }] }).ok, false);
  }
});

test("parseCountSave: duplicate item ids are rejected before replacement", () => {
  assert.equal(parseCountSave({
    count_month: "2026-08",
    counts: [{ item_id: UUID, qty: 1 }, { item_id: UUID, qty: 2 }],
  }).ok, false);
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

test("parseCountSave: location-scoped month-end writes are explicitly rejected", () => {
  assert.equal(parseCountSave({ count_month: "2026-08", counts: [], location_id: "evil" }).ok, false);
  assert.equal(parseCountSave({ count_month: "2026-08", counts: [], location_id: UUID }).ok, false);
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
  assert.equal(parseSummarySave({ count_month: "2026-08", sales: -1 }).ok, false);
});

test("parseSummarySave: invalid month rejected", () => {
  assert.equal(parseSummarySave({ count_month: "bad", sales: 1 }).ok, false);
});

// ---------------------------------------------------------------------------
// Add-item validation
// ---------------------------------------------------------------------------

test("parseNewItem: trims name, accepts a dropdown unit, and takes blank cost as zero", () => {
  const p = parseNewItem({ name: "  Sesame buns  ", unit: "case", unit_cost: "" });
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.equal(p.value.name, "Sesame buns");
    assert.equal(p.value.unit, "case");
    assert.equal(p.value.unit_cost, 0);
    assert.equal(p.value.position, null);
  }
});

test("parseNewItem: case price and pack size are optional, validated, and blank means missing", () => {
  const blank = parseNewItem({ name: "buns", unit: "ea" });
  assert.ok(blank.ok);
  if (blank.ok) {
    assert.equal(blank.value.pack_size, null);
    assert.equal(blank.value.case_price, null);
  }
  const priced = parseNewItem({ name: "buns", unit: "ea", pack_size: "12", case_price: 69.79 });
  assert.ok(priced.ok);
  if (priced.ok) {
    assert.equal(priced.value.pack_size, 12);
    assert.equal(priced.value.case_price, 69.79);
  }
  // A 0 pack size or case price is meaningless — stored as missing, never zero.
  const zero = parseNewItem({ name: "buns", unit: "ea", pack_size: 0, case_price: 0 });
  assert.ok(zero.ok);
  if (zero.ok) {
    assert.equal(zero.value.pack_size, null);
    assert.equal(zero.value.case_price, null);
  }
  assert.equal(parseNewItem({ name: "buns", unit: "ea", pack_size: -1 }).ok, false);
  assert.equal(parseNewItem({ name: "buns", unit: "ea", case_price: "junk" }).ok, false);
});

test("parseNewItem: a unit outside the dropdown is rejected, never coerced to ea", () => {
  for (const unit of ["", "   ", "furlongs", "KG", "kilograms"]) {
    assert.equal(parseNewItem({ name: "buns", unit }).ok, false, `unit ${JSON.stringify(unit)}`);
  }
  // Every unit the relation offers is accepted as-is.
  for (const unit of INVENTORY_UNIT_VALUES) {
    assert.equal(parseNewItem({ name: "buns", unit }).ok, true, `unit ${unit}`);
  }
});

test("parseNewItem: invalid/negative costs are rejected, never silently zeroed", () => {
  for (const unit_cost of ["junk", -1, "-0.01", Infinity]) {
    assert.equal(parseNewItem({ name: "buns", unit: "ea", unit_cost }).ok, false);
  }
});

test("parseNewItem: blank or oversized name rejected", () => {
  assert.equal(parseNewItem({ name: "   ", unit: "ea" }).ok, false);
  assert.equal(parseNewItem({}).ok, false);
  assert.equal(parseNewItem({ name: "x".repeat(201), unit: "ea" }).ok, false);
});

test("parseNewItem: position must be a non-negative integer to be honoured", () => {
  const p = parseNewItem({ name: "buns", unit: "ea", position: 7 });
  assert.equal(p.ok && p.value.position, 7);
  const q = parseNewItem({ name: "buns", unit: "ea", position: -1 });
  assert.equal(q.ok && q.value.position, null);
});

// ---------------------------------------------------------------------------
// Append-only master list
// ---------------------------------------------------------------------------

test("a master item may not be renamed; its unit and cost still may be", () => {
  const master = { name: "Allo tiki", protected: true };
  assert.equal(assertEditableItem(master, "Allo tiki").ok, true);
  assert.equal(assertEditableItem(master, "  Allo tiki  ").ok, true, "whitespace is not a rename");
  const renamed = assertEditableItem(master, "Allo Tiki");
  assert.equal(renamed.ok, false);
  if (!renamed.ok) assert.match(renamed.error, /cannot be renamed/);
});

test("a locally added item keeps its name editable", () => {
  assert.equal(assertEditableItem({ name: "Birria", protected: false }, "Birria consommé").ok, true);
  assert.equal(assertEditableItem({ name: "Birria", protected: null }, "Birria consommé").ok, true);
});

test("editing an item that no longer exists reports not found", () => {
  const missing = assertEditableItem(null, "Allo tiki");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /not found/);
});

test("purchase dates must be real calendar dates inside the selected month", () => {
  assert.equal(isDateInMonth("2026-02-28", "2026-02"), true);
  assert.equal(isDateInMonth("2024-02-29", "2024-02"), true);
  assert.equal(isDateInMonth("2026-02-29", "2026-02"), false);
  assert.equal(isDateInMonth("2026-02-31", "2026-02"), false);
  assert.equal(isDateInMonth("2026-03-01", "2026-02"), false);
});

test("optional finalize sales preserves blank as null and rejects bad money", () => {
  assert.deepEqual(parseOptionalSales(""), { ok: true, value: null });
  assert.deepEqual(parseOptionalSales("12000.126"), { ok: true, value: 12000.13 });
  assert.equal(parseOptionalSales(-1).ok, false);
  assert.equal(parseOptionalSales("junk").ok, false);
});

test("snapshot versions start at 1 and increment on every re-finalization", () => {
  assert.equal(nextSnapshotVersion(null), 1);
  assert.equal(nextSnapshotVersion({ version: 1 }), 2);
  assert.equal(nextSnapshotVersion({ version: 4 }), 5);
  assert.equal(nextSnapshotVersion({ version: "bad" }), 2);
});
