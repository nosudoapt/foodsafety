import test from "node:test";
import assert from "node:assert/strict";
import { workedMinutes, hoursTotals, hoursLabel, timeProblem, approvedHoursCsv, canClock, canReviewTime, locationToday, type TimeEntry } from "../src/lib/btb-time";
import { readCsv } from "../src/lib/btb-finance";

const id = "10000000-0000-4000-8000-000000000001";
const entry = (changes: Partial<TimeEntry> = {}): TimeEntry => ({ id, location_id: id, employee_id: id, shift_id: null, work_date: "2026-11-03", recorded_in: "2026-11-03T16:00:00.123456Z", recorded_out: "2026-11-04T00:00:00.123456Z", effective_in: "2026-11-03T09:00:00-07:00", effective_out: "2026-11-03T17:00:00-07:00", break_minutes: 30, status: "pending", version: 2, notes: "", review_notes: null, reviewed_by_name: null, reviewed_at: null, ...changes });

test("worked minutes use instants across overnight shifts and repeated/skipped DST wall clocks", () => {
  assert.equal(workedMinutes("2026-11-03T18:00:00-07:00", "2026-11-04T02:00:00-07:00", 30), 450);
  assert.equal(workedMinutes("2020-11-01T01:30:00-06:00", "2020-11-01T01:30:00-07:00", 0), 60);
  assert.equal(workedMinutes("2020-03-08T01:30:00-07:00", "2020-03-08T03:30:00-06:00", 0), 60);
  assert.equal(workedMinutes("2026-11-03T16:00:00.123456Z", "2026-11-04T00:00:00.123456Z", 30), 450);
  assert.equal(workedMinutes("2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z", 1440), 0);
});

test("invalid, offset-free, missing, reversed and stale punches never become zero hours", () => {
  for (const [start, end, breaks] of [[null, "2026-11-03T17:00:00Z", 0], ["2026-11-03T09:00:00Z", null, 0], ["2026-11-03T09:00:00Z", "2026-11-03T17:00:00Z", null], ["2026-11-03T09:00:00", "2026-11-03T17:00:00", 0], ["2026-02-30T09:00:00Z", "2026-02-30T17:00:00Z", 0], ["2026-11-03T24:00:00Z", "2026-11-04T08:00:00Z", 0], ["2026-11-03T09:00:00Z", "2026-11-03T09:00:00Z", 0], ["2026-11-03T09:00:00Z", "2026-11-03T08:00:00Z", 0], ["2026-11-03T09:00:00Z", "2026-11-04T10:00:00Z", 0], ["2026-11-03T09:00:00Z", "2026-11-03T17:00:00Z", -1], ["2026-11-03T09:00:00Z", "2026-11-03T17:00:00Z", 481], ["2026-11-03T09:00:00Z", "2026-11-03T17:00:00Z", 0.5]] as const) assert.equal(workedMinutes(start, end, breaks), null, JSON.stringify([start, end, breaks]));
  assert.equal(hoursLabel(null), "Missing"); assert.equal(hoursLabel(0), "0.00 h");
});

test("weekly worked and approved totals remain distinct and invalid approved records make exports unavailable", () => {
  assert.deepEqual(hoursTotals([entry(), entry({ status: "approved" }), entry({ status: "changes_requested" }), entry({ status: "open", effective_out: null, break_minutes: null })]), { worked: 1350, approved: 450, pending: 2, open: 1 });
  assert.deepEqual(hoursTotals([]), { worked: 0, approved: 0, pending: 0, open: 0 });
  assert.deepEqual(hoursTotals([entry({ break_minutes: null })]), { worked: null, approved: 0, pending: 1, open: 0 });
  assert.deepEqual(hoursTotals([entry({ status: "approved", break_minutes: null })]), { worked: null, approved: null, pending: 0, open: 0 });
  assert.throws(() => approvedHoursCsv([entry({ status: "approved", effective_out: null })], [], "America/Edmonton"), /incomplete or invalid/);
});

test("approved-hours CSV excludes unapproved/open records, normalizes UTC columns and retains approval attribution", () => {
  const approved = entry({ status: "approved", reviewed_by_name: "Manager", reviewed_at: "2026-11-04T01:00:00Z" });
  const csv = approvedHoursCsv([approved, entry(), entry({ status: "open" })], [{ id, name: "=Employee", position: "Cook", role: "staff", active: false }], "America/Edmonton");
  const parsed = readCsv(csv); assert.equal(parsed.ok, true); if (!parsed.ok) return;
  assert.equal(parsed.value.length, 2);
  assert.deepEqual(parsed.value[1], ["'=Employee", "2026-11-03", "2026-11-03T16:00:00.000Z", "2026-11-04T00:00:00.000Z", "30", "7.5000", "Manager", "2026-11-04T01:00:00Z", "America/Edmonton"]);
  assert.match(approvedHoursCsv([approved], [], "America/Edmonton"), /Former employee/);
});

test("time corrections require a record version, explicit breaks, absolute valid timestamps and an audit reason", () => {
  const values = { id, version: 2, effective_in: "2026-11-03T09:00:00-07:00", effective_out: "2026-11-03T17:00:00-07:00", break_minutes: 30, reason: "Source verified" };
  assert.equal(timeProblem("correct", values), null);
  for (const changes of [{ version: 0 }, { version: "2" }, { break_minutes: null }, { break_minutes: "30" }, { reason: " " }, { effective_in: "2026-11-03T09:00:00" }, { effective_in: "2026-02-30T09:00:00-07:00" }]) assert.ok(timeProblem("correct", { ...values, ...changes }), JSON.stringify(changes));
  assert.ok(timeProblem("clock_in", { shift_id: "other" })); assert.equal(timeProblem("clock_in", { shift_id: null }), null);
  assert.ok(timeProblem("request_changes", { id, version: 1 })); assert.ok(timeProblem("reopen", { id, version: 1, reason: "" }));
});

test("clocking and review roles are deliberately different; location dates ignore the browser timezone", () => {
  assert.equal(canClock("staff"), true); assert.equal(canClock("supervisor"), true); assert.equal(canClock("manager"), true);
  for (const role of ["corporate", "owner", "designer", "admin"] as const) assert.equal(canClock(role), false, role);
  assert.equal(canReviewTime("manager"), true); assert.equal(canReviewTime("owner"), true); assert.equal(canReviewTime("supervisor"), false); assert.equal(canReviewTime("corporate"), false);
  assert.equal(locationToday("America/Edmonton", new Date("2026-11-18T05:00:00Z")), "2026-11-17");
  assert.equal(locationToday("Asia/Tokyo", new Date("2026-11-18T05:00:00Z")), "2026-11-18");
});
