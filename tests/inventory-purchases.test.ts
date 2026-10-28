import { test } from "node:test";
import assert from "node:assert/strict";
import { daysInMonth, monthDates, dailyTotal, monthlyTotal, isDuplicateInvoice, type PurchaseEntry } from "../src/lib/inventory-purchases";

test("month lengths 28/29/30/31", () => {
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(daysInMonth("2026-04"), 30);
  assert.equal(daysInMonth("2026-01"), 31);
  assert.equal(monthDates("2026-02").length, 28);
});

test("daily and monthly totals", () => {
  const entries: PurchaseEntry[] = [
    { count_month: "2026-10", purchase_date: "2026-10-12", type: "gfs", description: "GFS", amount: 2000, supplier: "GFS", reference: "INV1" },
    { count_month: "2026-10", purchase_date: "2026-10-12", type: "local", description: "cucumber", amount: 10 },
    { count_month: "2026-10", purchase_date: "2026-10-13", type: "local", description: "tomatoes", amount: 10 },
  ];
  assert.equal(dailyTotal(entries, "2026-10-12"), 2010);
  assert.equal(monthlyTotal(entries, "gfs"), 2000);
  assert.equal(monthlyTotal(entries, "local"), 20);
  assert.equal(monthlyTotal(entries), 2020);
});

test("duplicate invoice detection", () => {
  const entries: PurchaseEntry[] = [
    { count_month: "2026-10", purchase_date: "2026-10-12", type: "gfs", description: "GFS", amount: 2000, supplier: "GFS", reference: "INV1" },
  ];
  const dup: PurchaseEntry = { count_month: "2026-10", purchase_date: "2026-10-12", type: "gfs", description: "GFS", amount: 2000, supplier: "GFS", reference: "INV1" };
  assert.equal(isDuplicateInvoice(entries, dup), true);
  const ok: PurchaseEntry = { count_month: "2026-10", purchase_date: "2026-10-12", type: "gfs", description: "GFS", amount: 2000, supplier: "GFS", reference: "INV2" };
  assert.equal(isDuplicateInvoice(entries, ok), false);
});
