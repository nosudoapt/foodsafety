import { test } from "node:test";
import assert from "node:assert/strict";
import {
  foodCost, money, salesTotal, SALES_BASIS, shiftMonth, isMonthKey, monthLabel, INVENTORY_ACTIONS,
  parseQuantity, lineValue, closingValue,
  textOf, numberOf, rowsOf, purchaseLineDraft, purchaseLinesProblem,
} from "../src/lib/btb-platform-inventory";

// --- the client's confirmed formula -----------------------------------------
test("COGS = opening + purchases - closing and % = COGS / net sales x 100", () => {
  // opening 10,000 + purchases 4,000 - closing 9,000 = COGS 5,000;
  // 5,000 / 25,000 x 100 = 20%.
  const r = foodCost(10_000, 4_000, 9_000, 25_000);
  assert.equal(r.cogs, 5_000);
  assert.equal(r.foodCostPct, 20);
  assert.deepEqual(r.missing, []);
  assert.equal(r.purchases, 4_000);
});

test("COGS is computed even when net sales is unavailable", () => {
  const r = foodCost(5000, 2000, 4000, null);
  assert.equal(r.cogs, 3000);
  assert.equal(r.foodCostPct, null, "no sales figure must not fabricate a percentage");
  assert.deepEqual(r.missing, ["net sales"]);
});

// --- missing is never zero ---------------------------------------------------
test("a missing input yields null and is never counted as zero", () => {
  const cases: { opening: number | null; purchases: number | null; closing: number | null; expected: string }[] = [
    { opening: null, purchases: 2000, closing: 4000, expected: "opening inventory" },
    { opening: 5000, purchases: null, closing: 4000, expected: "purchases" },
    { opening: 5000, purchases: 2000, closing: null, expected: "closing inventory" },
  ];
  for (const { opening, purchases, closing, expected } of cases) {
    const r = foodCost(opening, purchases, closing, 12_000);
    assert.ok(Array.isArray(r.missing));
    assert.equal(r.cogs, null, "COGS must be null, never a zero-filled number");
    assert.equal(r.foodCostPct, null);
    assert.ok(r.missing.includes(expected), `expected ${expected} in ${r.missing.join(",")}`);
  }
});

test("undefined is treated as missing, not as zero", () => {
  const r = foodCost(undefined, 2000, 4000, 12_000);
  assert.equal(r.cogs, null);
  assert.equal(r.purchases, 2000);
  assert.deepEqual(r.missing, ["opening inventory"]);
});

test("purchases of genuinely zero stay zero and still produce COGS", () => {
  const r = foodCost(1000, 0, 800, 5000);
  assert.equal(r.purchases, 0);
  assert.equal(r.cogs, 200);
  assert.equal(r.foodCostPct, 4);
});

test("zero or negative sales never divides and never fabricates a percentage", () => {
  for (const sales of [0, -100]) {
    const r = foodCost(1000, 500, 800, sales);
    assert.equal(r.foodCostPct, null, `sales=${sales} must withhold the percentage`);
    assert.equal(r.cogs, 700, "COGS stays valid without a usable sales figure");
    assert.deepEqual(r.missing, [], "a zero sale is present, not missing");
  }
});

// --- money formatting: missing is not zero ----------------------------------
test("money renders a missing amount as the word Missing", () => {
  assert.equal(money(null), "Missing");
  assert.equal(money(undefined), "Missing");
  assert.equal(money(Number.NaN), "Missing");
  assert.match(money(0), /\$0\.00/);
  assert.match(money(1234.5), /\$1,234\.50/);
});

// --- POS sales basis --------------------------------------------------------
const posFigures = [
  { label: "Summary Total Net Sales", value: 61_108.19 },
  { label: "Summary Total Gross Sales", value: 64_756.94 },
];

test("the confirmed basis selects exactly its own figure", () => {
  assert.equal(SALES_BASIS, "Summary Total Net Sales");
  assert.equal(salesTotal(posFigures, SALES_BASIS), 61_108.19);
});

test("a repeated or absent basis label is rejected instead of summed", () => {
  assert.equal(salesTotal([...posFigures, { label: SALES_BASIS, value: 1 }], SALES_BASIS), null);
  assert.equal(salesTotal([posFigures[1]], SALES_BASIS), null);
  assert.equal(salesTotal([], SALES_BASIS), null);
  assert.equal(salesTotal(null, SALES_BASIS), null);
  assert.equal(salesTotal(posFigures, ""), null);
});

test("a non-positive or non-finite basis figure is not a usable sale", () => {
  assert.equal(salesTotal([{ label: SALES_BASIS, value: 0 }], SALES_BASIS), null);
  assert.equal(salesTotal([{ label: SALES_BASIS, value: -5 }], SALES_BASIS), null);
  assert.equal(salesTotal([{ label: SALES_BASIS, value: Number.NaN }], SALES_BASIS), null);
});

// --- accounting months -------------------------------------------------------
test("accounting months validate and shift across year boundaries", () => {
  assert.equal(isMonthKey("2026-01"), true);
  assert.equal(isMonthKey("2026-13"), false);
  assert.equal(isMonthKey("2026-1"), false);
  assert.equal(isMonthKey(""), false);
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", 0), "2026-01");
  assert.equal(monthLabel("2026-01"), "January 2026");
});

test("the action list matches the SQL state machine", () => {
  assert.deepEqual([...INVENTORY_ACTIONS], [
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
  ]);
});

// --- closing count costing ---------------------------------------------------
test("a line is cases x case price + packets x packet price", () => {
  assert.equal(lineValue(4, 2, 40, 7), 174); // 4x40 + 2x7
  assert.equal(lineValue(0, 0, 40, 7), 0, "an explicit zero/zero count is a real 0");
});

test("a blank count is null, not zero", () => {
  assert.equal(parseQuantity(""), null);
  assert.equal(parseQuantity("  "), null);
  assert.equal(parseQuantity(null), null);
  assert.equal(parseQuantity(undefined), null);
  assert.equal(parseQuantity("0"), 0, "a typed zero is a real zero");
  assert.equal(parseQuantity(3), 3);
  assert.equal(parseQuantity("2.5"), 2.5);
});

test("junk and negative counts are rejected rather than coerced to zero", () => {
  assert.equal(parseQuantity("abc"), null);
  assert.equal(parseQuantity("-1"), null);
  assert.equal(parseQuantity("1e3"), null);
  assert.equal(parseQuantity(Number.NaN), null);
});

test("a line missing a price or a count cannot be valued", () => {
  assert.equal(lineValue(null, 0, 40, 7), null);
  assert.equal(lineValue(1, 0, 40, null), null);
  assert.equal(lineValue(1, 0, undefined, 7), null);
});

test("closing total is null when any line is unvalued", () => {
  assert.equal(closingValue([]), null);
  assert.equal(closingValue([{ value: 20 }, { value: 12.5 }]), 32.5);
  assert.equal(closingValue([{ value: 20 }, { value: null }]), null);
});

// --- extracted document rows are untrusted -----------------------------------
test("extraction readers never invent or coerce a value", () => {
  assert.equal(textOf("  GFS  "), "GFS");
  assert.equal(textOf(undefined), "");
  assert.equal(textOf(42), "");
  assert.equal(numberOf("12.5"), 12.5);
  assert.equal(numberOf(12.5), 12.5);
  assert.equal(numberOf(""), null);
  assert.equal(numberOf("1e3"), null);
  assert.equal(numberOf("$12"), null);
  assert.equal(numberOf(Number.NaN), null);
  assert.equal(rowsOf([{ a: 1 }, "x", null, [1]]).length, 1);
  assert.deepEqual(rowsOf("nope"), []);
});

test("a blank extracted line stays blank, not zero", () => {
  const draft = purchaseLineDraft({ description: "Beef patties" });
  assert.equal(draft.description, "Beef patties");
  assert.equal(draft.cases, "");
  assert.equal(draft.packets, "");
  assert.equal(draft.line_total, "");
  assert.equal(draft.item_id, null);

  const filled = purchaseLineDraft({ description: "Beef patties", cases: 3, packets: "2", line_total: "174.00" });
  assert.equal(filled.cases, "3");
  assert.equal(filled.packets, "2");
  assert.equal(filled.line_total, "174");
});

test("reviewed purchase lines are blocked until every counted line has a total", () => {
  const complete = purchaseLineDraft({ description: "Beef patties", cases: 3, packets: 2, line_total: 174 });
  assert.equal(purchaseLinesProblem([complete]), null);

  const noDescription = purchaseLineDraft({ cases: 1, line_total: 10 });
  assert.match(purchaseLinesProblem([noDescription]) ?? "", /description/i);

  const blankPackets = purchaseLineDraft({ description: "Beef patties", cases: 3 });
  assert.match(purchaseLinesProblem([blankPackets]) ?? "", /packets/i);

  const noTotal = purchaseLineDraft({ description: "Beef patties", cases: 3, packets: 0 });
  assert.match(purchaseLinesProblem([noTotal]) ?? "", /line total/i);

  const zeroLine = purchaseLineDraft({ description: "Credit / no delivery", cases: 0, packets: 0 });
  assert.equal(purchaseLinesProblem([zeroLine]), null, "an explicit 0/0 line needs no total");

  // Junk read from a scan is normalised away on load, not rendered as a price.
  const junkFromScan = purchaseLineDraft({ description: "Oil", cases: 0, packets: 1, line_total: 30, unit_price: "n/a" });
  assert.equal(junkFromScan.unit_price, "");
  // ...but junk someone types into the reviewed cell is still rejected.
  const junkTyped = { ...junkFromScan, unit_price: "n/a" };
  assert.match(purchaseLinesProblem([junkTyped]) ?? "", /unit price/i);
});
