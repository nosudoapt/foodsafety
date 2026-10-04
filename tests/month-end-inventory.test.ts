import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_RETENTION_MONTHS,
  countQty,
  countsByItem,
  isMonthKey,
  lineValue,
  monthKey,
  monthLabel,
  nextMonth,
  prevMonth,
  recentMonths,
  thisMonth,
  toLines,
  totalValue,
  variance,
  withinRetention,
  type InventoryCount,
  type InventoryItem,
} from "../src/lib/month-end-inventory";

test("month keys come from local dates and validate before use", () => {
  assert.equal(monthKey("2026-09-30"), "2026-09");
  assert.equal(monthKey("2026-10-01"), "2026-10");
  assert.equal(monthKey("nope"), "", "garbage in → empty key");
  assert.equal(isMonthKey("2026-09"), true);
  assert.equal(isMonthKey("2026-13"), false, "month 13 isn't real");
  assert.equal(isMonthKey("2026-9"), false, "zero-padded only");
  assert.match(thisMonth(), /^\d{4}-\d{2}$/);
});

test("the closing calendar rolls across the year boundary", () => {
  assert.equal(prevMonth("2026-01"), "2025-12");
  assert.equal(prevMonth("2026-09"), "2026-08");
  assert.equal(nextMonth("2026-12"), "2027-01");
  assert.equal(nextMonth("2026-09"), "2026-10");
  assert.equal(prevMonth("junk"), "junk", "invalid keys pass through untouched");
  assert.equal(monthLabel("2026-09"), "Sep 2026");
  assert.deepEqual(recentMonths("2026-10", 3), ["2026-10", "2026-09", "2026-08"]);
  assert.deepEqual(recentMonths("2026-01", 3), ["2026-01", "2025-12", "2025-11"], "crosses New Year");
});

test(`retention keeps ${INVENTORY_RETENTION_MONTHS} closing months`, () => {
  assert.equal(INVENTORY_RETENTION_MONTHS, 24);
  assert.equal(withinRetention("2026-10", "2026-10"), true, "current month survives");
  assert.equal(withinRetention("2024-11", "2026-10"), true, "oldest month of the window");
  assert.equal(withinRetention("2024-10", "2026-10"), false, "one month older is purged");
  assert.equal(withinRetention("2026-11", "2026-10"), false, "future months aren't in the window");
});

test("typed quantities are normalised before they touch the sheet", () => {
  assert.equal(countQty("3.5"), 3.5);
  assert.equal(countQty(1.234), 1.23, "pennies only");
  assert.equal(countQty("twelve"), 0, "junk → 0");
  assert.equal(countQty(-4), 0, "negative counts don't exist");
  assert.equal(countQty(undefined), 0);
  assert.equal(countsByItem([{ item_id: "a", count_month: "2026-09", qty: 2.5 }]).get("a"), 2.5);
});

const item = (over: Partial<InventoryItem> & { id: string; name: string }): InventoryItem => ({
  unit: "ea",
  unit_cost: 0,
  position: 0,
  ...over,
});

test("valuation multiplies quantity by unit cost, rounded to cents", () => {
  assert.equal(lineValue(3, 2.5), 7.5);
  assert.equal(lineValue(0.1, 0.3), 0.03, "0.030000000000000004 → 0.03");
  assert.equal(lineValue(5, -1), 0, "negative costs don't credit the sheet");
  const lines = [
    { item: item({ id: "a", name: "Buns", unit_cost: 1.25 }), qty: 40 },
    { item: item({ id: "b", name: "Patties", unit_cost: 3.1 }), qty: 0 },
  ];
  assert.equal(totalValue(lines), 50);
  assert.equal(totalValue([]), 0);
});

test("the closing sheet merges the item list with the month's counts", () => {
  const items = [
    item({ id: "b", name: "Fries", position: 1 }),
    item({ id: "a", name: "Buns", position: 0 }),
    item({ id: "c", name: "Oil", position: 1, unit: "L" }), // same position → name tie-break
  ];
  const counts: InventoryCount[] = [
    { item_id: "a", count_month: "2026-09", qty: 12 },
    { item_id: "c", count_month: "2026-09", qty: "8" as unknown as number },
  ];
  const lines = toLines(items, counts);
  assert.deepEqual(
    lines.map((l) => [l.item.name, l.qty]),
    [
      ["Buns", 12],
      ["Fries", 0],
      ["Oil", 8],
    ],
    "uncounted items default to 0, order is position → name",
  );
});

test("variance reports the change and a safe percentage", () => {
  assert.deepEqual(variance(150, 100), { delta: 50, pct: 50 });
  assert.deepEqual(variance(100, 150), { delta: -50, pct: -33.3, });
  assert.deepEqual(variance(0, 0), { delta: 0, pct: 0 });
  assert.deepEqual(variance(10, 0), { delta: 10, pct: 0 }, "no baseline → no percentage");
  assert.equal(variance("abc" as unknown as number, 5).delta, -5, "junk current reads as 0 → 0 - 5");
});
