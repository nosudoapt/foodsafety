import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CASH_OUT_RETENTION_DAYS,
  isEmptyDraft,
  retentionCutoff,
  toDraft,
  tillLeft,
  totalCashIn,
  totalDropped,
  totalsFor,
  withinRetention,
} from "../src/lib/cash-out";

const TODAY = "2026-10-02";

const draft = () =>
  toDraft({
    count_date: TODAY,
    till_amount: "250.50",
    cash_sale: "1800",
    delivery_fees: "120.25",
    driver_tips: "45",
    cash_out: "1500",
    safe_drop: "600",
  });

test("cash-in, drop and till-left are the page's three derived numbers", () => {
  const d = draft();
  assert.equal(totalCashIn(d), 1965.25); // 1800 + 120.25 + 45
  assert.equal(totalDropped(d), 2100); // 1500 + 600
  assert.equal(tillLeft(d), -1849.5); // 250.50 - 2100
});

test("blank and junk inputs normalise to 0 (never NaN in the table)", () => {
  const d = toDraft({
    count_date: TODAY,
    till_amount: "",
    cash_sale: "  ",
    delivery_fees: "abc",
    driver_tips: null as unknown as string,
    cash_out: "12.345",
    safe_drop: 0,
  });
  assert.equal(d.till_amount, 0);
  assert.equal(d.cash_sale, 0);
  assert.equal(d.delivery_fees, 0);
  assert.equal(d.driver_tips, 0);
  assert.equal(d.cash_out, 12.35); // money rounds to cents
  assert.equal(Number.isNaN(tillLeft(d)), false);
});

test("an all-zero draft is empty and would not be saved", () => {
  assert.equal(
    isEmptyDraft(
      toDraft({
        count_date: TODAY,
        till_amount: 0,
        cash_sale: 0,
        delivery_fees: 0,
        driver_tips: 0,
        cash_out: 0,
        safe_drop: 0,
      }),
    ),
    true,
  );
  assert.equal(isEmptyDraft(draft()), false);
});

test("history totals sum every column across the window", () => {
  const t = totalsFor([
    draft(),
    toDraft({ count_date: "2026-10-01", till_amount: 100, cash_sale: 900, delivery_fees: 0, driver_tips: 0, cash_out: 800, safe_drop: 200 }),
  ]);
  assert.equal(t.cash_sale, 2700);
  assert.equal(t.cash_out, 2300);
  assert.equal(t.till_amount, 350.5);
});

test("retention window is 30 days including today", () => {
  assert.equal(CASH_OUT_RETENTION_DAYS, 30);
  assert.equal(retentionCutoff(TODAY), "2026-09-03");
  assert.equal(withinRetention("2026-09-03", TODAY), true, "cutoff day is kept");
  assert.equal(withinRetention("2026-09-02", TODAY), false, "day before cutoff is purged");
  assert.equal(withinRetention(TODAY, TODAY), true);
  assert.equal(withinRetention("2026-10-03", TODAY), false, "future dates aren't in the window");
});

test("window crosses a month boundary and never leaves the local calendar", () => {
  assert.equal(retentionCutoff("2026-03-05"), "2026-02-04");
  assert.equal(retentionCutoff("2026-01-01"), "2025-12-03");
});
