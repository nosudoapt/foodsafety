import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DATE_CATEGORIES,
  addMonths,
  categoryLabel,
  daysUntil,
  dueStatus,
  isCategory,
  isRecurrence,
  nextOccurrence,
  prettyDate,
  sortDates,
  type CorporateDate,
} from "../src/lib/tax-dates";

// 2026-10-02 is a Friday (same anchor the other suites use).
const TODAY = "2026-10-02";

test("days are counted to the deadline, across the year boundary", () => {
  assert.equal(daysUntil(TODAY, TODAY), 0);
  assert.equal(daysUntil("2026-10-01", TODAY), -1);
  assert.equal(daysUntil("2027-01-15", TODAY), 105, "Oct 2 → Dec 31 is 90 days, +15");
  assert.equal(daysUntil("2026-09-30", TODAY), -2);
});

test("status buckets: overdue, inside a week, still ahead", () => {
  assert.equal(dueStatus("2026-10-01", TODAY), "overdue");
  assert.equal(dueStatus(TODAY, TODAY), "soon");
  assert.equal(dueStatus("2026-10-09", TODAY), "soon", "7 days out counts as soon");
  assert.equal(dueStatus("2026-10-10", TODAY), "upcoming", "8 days out is merely upcoming");
});

const row = (id: string, title: string, due: string): CorporateDate => ({
  id,
  title,
  category: "tax",
  due_date: due,
  recurrence: "none",
});

test("the list reads nearest-deadline first with a stable tie-break", () => {
  const sorted = sortDates(
    [row("c", "Later", "2027-03-01"), row("b", "Tomorrow", "2026-10-03"), row("a", "Yesterday", "2026-10-01")],
    TODAY,
  );
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["a", "b", "c"],
  );

  const tied = sortDates(
    [row("z", "HST", "2026-11-30"), row("y", "GST", "2026-11-30"), row("x", "CRA", "2026-06-01")],
    TODAY,
  );
  assert.deepEqual(
    tied.map((r) => r.title),
    ["CRA", "GST", "HST"],
    "same day → alphabetical, so rows don't jump between renders",
  );
});

test("months are added with the day clamped to the target month", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28", "2026 isn't a leap year");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29", "2024 is");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15", "rolls into next year");
});

test("a repeated deadline rolls forward to its next landing day", () => {
  assert.equal(nextOccurrence("2026-08-15", "monthly", TODAY), "2026-10-15");
  assert.equal(nextOccurrence("2026-01-31", "quarterly", TODAY), "2026-10-31", "Jan 31 → Apr 30 → Jul 31 → Oct 31");
  assert.equal(nextOccurrence("2024-02-29", "annual", TODAY), "2027-02-28", "leap-day deadlines clamp forward");
  assert.equal(nextOccurrence("2026-12-01", "monthly", TODAY), "2026-12-01", "future dates aren't touched");
  assert.equal(nextOccurrence("2026-06-01", "none", TODAY), "2026-06-01", "one-offs stay put");
  assert.equal(nextOccurrence("2026-06-01", "sometimes", TODAY), "2026-06-01", "unknown rules fall back");
});

test("categories and recurrences are validated before they hit the DB", () => {
  assert.equal(isCategory("tax"), true);
  assert.equal(isCategory("crypto"), false);
  assert.equal(isRecurrence("quarterly"), true);
  assert.equal(isRecurrence("weekly"), false, "weekly isn't a supported cadence");
  assert.equal(DATE_CATEGORIES.length, 5);
  assert.equal(categoryLabel("payroll"), "Payroll remittance");
  assert.equal(categoryLabel("visa"), "Visa", "free-text labels pass through");
  assert.equal(prettyDate("2027-01-15"), "Jan 15, 2027");
});
