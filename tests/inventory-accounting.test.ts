import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTING_FIXTURE,
  FOOD_COST_PCT_FLAG,
  computeAccounting,
  nullableAmount,
  resolveOpening,
  safeQty,
} from "../src/lib/inventory-accounting";
import { carryForwardOpening, prevMonth, nextMonth } from "../src/lib/month-end-inventory";
import { daysInMonth, monthDates, isDuplicateInvoice, type PurchaseEntry } from "../src/lib/inventory-purchases";

// --- numeric acceptance fixture from the spec -------------------------------
test("spec fixture: opening 5000 + purchases 2000 − closing 4000 = COGS 3000, 25%", () => {
  const r = computeAccounting(ACCOUNTING_FIXTURE);
  assert.equal(r.cogs, 3000);
  assert.equal(r.foodCostPct, 25);
  assert.equal(r.status, "complete");
  assert.deepEqual(r.flags, { negativeCogs: false, suspiciousPct: false });
});

// --- input normalisation -----------------------------------------------------
test("safeQty normalises junk, negatives and decimals", () => {
  assert.equal(safeQty("3.5"), 3.5);
  assert.equal(safeQty(1.234), 1.23);
  assert.equal(safeQty("twelve"), 0);
  assert.equal(safeQty(-4), 0);
  assert.equal(safeQty(undefined), 0);
});

test("nullableAmount keeps null distinct from zero", () => {
  assert.equal(nullableAmount(null), null);
  assert.equal(nullableAmount(""), null);
  assert.equal(nullableAmount(undefined), null);
  assert.equal(nullableAmount("abc"), null);
  assert.equal(nullableAmount(-5), null, "negative amounts are invalid, not zero");
  assert.equal(nullableAmount(0), 0, "a real zero stays zero");
  assert.equal(nullableAmount("12.345"), 12.35);
});

// --- missing inputs are never fabricated as zero ----------------------------
test("baseline month (no opening) reports no_opening with null COGS/pct", () => {
  const r = computeAccounting({ opening: null, purchases: 2000, closing: 4000, sales: 12000 });
  assert.equal(r.status, "no_opening");
  assert.equal(r.cogs, null, "never fabricate COGS without an opening");
  assert.equal(r.foodCostPct, null);
});

test("missing closing reports no_closing with null COGS/pct", () => {
  const r = computeAccounting({ opening: 5000, purchases: 2000, closing: null, sales: 12000 });
  assert.equal(r.status, "no_closing");
  assert.equal(r.cogs, null);
  assert.equal(r.foodCostPct, null);
});

test("missing sales still computes COGS but pct is null (no_sales)", () => {
  const r = computeAccounting({ opening: 5000, purchases: 2000, closing: 4000, sales: null });
  assert.equal(r.cogs, 3000);
  assert.equal(r.foodCostPct, null, "never show a % without sales");
  assert.equal(r.status, "no_sales");
});

test("zero sales never divides by zero — pct null, status zero_sales", () => {
  const r = computeAccounting({ opening: 5000, purchases: 2000, closing: 4000, sales: 0 });
  assert.equal(r.cogs, 3000);
  assert.equal(r.foodCostPct, null, "0 sales → undefined %, not Infinity/NaN");
  assert.equal(r.status, "zero_sales");
});

test("a real 0 opening is distinguishable from missing opening", () => {
  // opening=0 is a legitimate value (truly started with nothing), so COGS is computable.
  const r = computeAccounting({ opening: 0, purchases: 2000, closing: 4000, sales: 12000 });
  assert.equal(r.cogs, -2000, "closing > opening + purchases → negative COGS (flagged)");
  assert.equal(r.flags.negativeCogs, true);
});

test("empty month reports 'empty' status", () => {
  const r = computeAccounting({ opening: null, purchases: 0, closing: null, sales: null });
  assert.equal(r.status, "empty");
  assert.equal(r.cogs, null);
});

// --- suspicious-result flags ------------------------------------------------
test("an out-of-band food cost % is flagged for review but still returned", () => {
  const r = computeAccounting({ opening: 5000, purchases: 2000, closing: 1000, sales: 2000 });
  assert.equal(r.cogs, 6000);
  assert.equal(r.foodCostPct, 300);
  assert.ok(r.foodCostPct > FOOD_COST_PCT_FLAG);
  assert.equal(r.flags.suspiciousPct, true);
});

test("negative COGS sets the review flag", () => {
  const r = computeAccounting({ opening: 1000, purchases: 0, closing: 4000, sales: 5000 });
  assert.equal(r.cogs, -3000);
  assert.equal(r.flags.negativeCogs, true);
});

// --- currency precision -----------------------------------------------------
test("COGS and pct are rounded to cents / one decimal", () => {
  const r = computeAccounting({ opening: 1234.567, purchases: 89.999, closing: 100.004, sales: 999.999 });
  // opening 1234.57 + purchases 90.00 − closing 100.00 = COGS 1224.57
  assert.equal(r.cogs, 1224.57);
  // pct = 1224.57 / 999.999 × 100 = 122.457… → 122.5 (one decimal)
  assert.equal(r.foodCostPct, 122.5);
  assert.equal(r.status, "complete");
});

// --- opening carry-forward --------------------------------------------------
test("resolveOpening carries the prior FINALIZED closing forward", () => {
  const r = resolveOpening({ sourceMonth: "2025-09", closing: 4000 });
  assert.equal(r.opening, 4000);
  assert.equal(r.carriedFrom, "2025-09");
  assert.equal(r.baseline, false);
});

test("resolveOpening reports baseline when prior month is missing/unfinalized", () => {
  for (const prior of [null, undefined, { sourceMonth: null, closing: null }, { sourceMonth: "2025-09", closing: null }]) {
    const r = resolveOpening(prior);
    assert.equal(r.opening, null, "never fabricate an opening");
    assert.equal(r.baseline, true);
    assert.equal(r.carriedFrom, null);
  }
});

test("carry-forward helper clamps negatives but preserves real values", () => {
  assert.equal(carryForwardOpening(4000), 4000);
  assert.equal(carryForwardOpening(-50), 0, "negative closing can't credit the next month");
  assert.equal(carryForwardOpening("junk" as unknown as number), 0);
});

// --- month boundaries, leap years, Dec→Jan ----------------------------------
test("month lengths include leap Februaries", () => {
  assert.equal(daysInMonth("2024-02"), 29, "2024 is a leap year");
  assert.equal(daysInMonth("2023-02"), 28);
  assert.equal(daysInMonth("2000-02"), 29, "divisible by 400 → leap");
  assert.equal(daysInMonth("2100-02"), 28, "divisible by 100 but not 400 → not leap");
  assert.equal(daysInMonth("2026-04"), 30);
  assert.equal(daysInMonth("2026-12"), 31);
  assert.equal(monthDates("2024-02").length, 29);
  assert.equal(monthDates("2024-02")[28], "2024-02-29");
});

test("December rolls to January and January rolls back across the year", () => {
  assert.equal(prevMonth("2026-01"), "2025-12");
  assert.equal(nextMonth("2025-12"), "2026-01");
  assert.equal(prevMonth("2025-12"), "2025-11");
  // String month keys compare chronologically for downstream checks.
  assert.ok("2026-01" > "2025-12");
  assert.ok("2025-10" > "2025-09");
});

// --- purchase totals & duplicate invoices -----------------------------------
test("multiple purchases on one date and multiple suppliers total correctly", () => {
  const entries: PurchaseEntry[] = [
    { count_month: "2026-10", purchase_date: "2026-10-12", type: "gfs", description: "GFS #1", amount: 2000, supplier: "GFS", reference: "INV1" },
    { count_month: "2026-10", purchase_date: "2026-10-12", type: "gfs", description: "GFS #2", amount: 500, supplier: "GFS", reference: "INV2" },
    { count_month: "2026-10", purchase_date: "2026-10-12", type: "local", description: "cucumber", amount: 10 },
    { count_month: "2026-10", purchase_date: "2026-10-13", type: "local", description: "tomatoes", amount: 10 },
  ];
  const daily12 = entries.filter((e) => e.purchase_date === "2026-10-12").reduce((s, e) => s + e.amount, 0);
  assert.equal(daily12, 2510);
  assert.equal(entries.filter((e) => e.type === "gfs").reduce((s, e) => s + e.amount, 0), 2500);
  assert.equal(entries.filter((e) => e.type === "local").reduce((s, e) => s + e.amount, 0), 20);
});

test("duplicate invoice detection ignores different references and self-edits", () => {
  const base: PurchaseEntry = { count_month: "2026-10", purchase_date: "2026-10-12", type: "gfs", description: "GFS", amount: 2000, supplier: "GFS", reference: "INV1" };
  const dup: PurchaseEntry = { ...base };
  const otherRef: PurchaseEntry = { ...base, reference: "INV2" };
  const sameRefEdit: PurchaseEntry = { ...base, id: "row-1" };
  assert.equal(isDuplicateInvoice([base], dup), true);
  assert.equal(isDuplicateInvoice([base], otherRef), false);
  // Editing a row and keeping its own reference isn't a duplicate of itself.
  assert.equal(isDuplicateInvoice([{ ...base, id: "row-1" }], sameRefEdit), false);
  // Local purchases never duplicate-check.
  assert.equal(isDuplicateInvoice([base], { ...base, type: "local", reference: null }), false);
});
