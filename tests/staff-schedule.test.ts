import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_SCHEDULE_RETENTION_DAYS,
  addDays,
  dayLabel,
  formatTime,
  isValidShift,
  shiftLabel,
  shiftsByDay,
  shiftsFor,
  weekDays,
  weekStart,
  withinRetention,
  type StaffShift,
} from "../src/lib/staff-schedule";

// 2026-10-02 is a Friday (same anchor the PAR-prefill tests use).
const FRI = "2026-10-02";

test("weeks run Monday → Sunday and never leave the month they start in", () => {
  assert.equal(weekStart(FRI), "2026-09-28");
  assert.equal(weekStart("2026-10-05"), "2026-10-05", "a Monday is its own week start");
  assert.equal(weekStart("2026-10-04"), "2026-09-28", "Sunday belongs to the week that started it");

  assert.deepEqual(weekDays(weekStart(FRI)), [
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
  ]);
});

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("times render as 12-hour clock labels", () => {
  assert.equal(formatTime("17:30"), "5:30 PM");
  assert.equal(formatTime("09:05"), "9:05 AM");
  assert.equal(formatTime("00:00"), "12:00 AM");
  assert.equal(formatTime("12:00"), "12:00 PM");
  assert.equal(shiftLabel("09:00", "17:00"), "9:00 AM – 5:00 PM");
  assert.equal(formatTime("banana"), "banana", "unparseable input passes through");
});

test("a shift must end after it starts, both as HH:MM", () => {
  assert.equal(isValidShift("09:00", "17:00"), true);
  assert.equal(isValidShift("17:00", "09:00"), false, "overnight shifts aren't supported");
  assert.equal(isValidShift("09:00", "09:00"), false, "zero-length");
  assert.equal(isValidShift("25:00", "26:00"), false, "hour must be 0-23");
  assert.equal(isValidShift("", "17:00"), false);
});

const shift = (id: string, date: string, start: string, end: string, member: string | null = "m1"): StaffShift => ({
  id,
  staff_member_id: member,
  shift_date: date,
  start_time: start,
  end_time: end,
});

test("the calendar groups a week's shifts by day, earliest first", () => {
  const days = weekDays("2026-09-28");
  const byDay = shiftsByDay(
    [
      shift("s2", "2026-10-01", "14:00", "22:00"),
      shift("s1", "2026-10-01", "09:00", "13:00"),
      shift("s3", "2026-10-04", "10:00", "16:00"),
      shift("s4", "2026-11-01", "10:00", "16:00"), // another week — ignored
    ],
    days,
  );
  assert.deepEqual(
    byDay["2026-10-01"].map((s) => s.id),
    ["s1", "s2"],
  );
  assert.equal(byDay["2026-10-04"].length, 1);
  assert.equal(byDay["2026-09-28"].length, 0, "empty days still get a column");
  assert.equal(byDay["2026-11-01"], undefined, "days outside the week aren't created");
});

test("staff see their own shifts, managers see everyone", () => {
  const shifts = [shift("a", FRI, "09:00", "17:00", "m1"), shift("b", FRI, "12:00", "18:00", "m2")];
  assert.deepEqual(shiftsFor(shifts, "m1").map((s) => s.id), ["a"]);
  assert.equal(shiftsFor(shifts, null).length, 2, "null member = the whole roster");
  assert.equal(shifts.length, 2, "filtering never mutates the source");
});

test("retention is 90 days including today", () => {
  assert.equal(STAFF_SCHEDULE_RETENTION_DAYS, 90);
  assert.equal(withinRetention("2026-07-05", FRI), true, "cutoff day survives");
  assert.equal(withinRetention("2026-07-04", FRI), false, "one day older is purged");
  assert.equal(withinRetention(FRI, FRI), true);
  assert.equal(withinRetention("2026-10-03", FRI), false, "future dates aren't in the window");
  assert.equal(dayLabel("2026-10-02"), "Fri, Oct 2");
});
