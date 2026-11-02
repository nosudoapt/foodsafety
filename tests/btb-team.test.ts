import { test } from "node:test";
import assert from "node:assert/strict";
import { BTB_EMPLOYEE_MAX_AGE, employeeClaimsFromSession, employeeSessionValueFor } from "../src/lib/btb-auth";
import { hashEmployeePassword, validEmployeePassword, verifyEmployeePassword } from "../src/lib/btb-passwords";
import { attributionName, btbToday, employeeEditableBy, isIsoDate, isVersion, validateEmployee } from "../src/lib/btb-team";
import { shiftInterval, shiftsOverlap, validOrderLines, type BtbShift } from "../src/lib/btb-operations";
import { employeeTrainingProgress, validTrainingSelection, type BtbTrainingTopic, type TrainingRecord } from "../src/lib/btb-training";
import { parseReminderEmails, reminderCanRetry, reminderKey, reminderLead, reminderMessage, validateReminderSettings, type ReminderJob } from "../src/lib/btb-reminders";

const employeeId = "50000000-0000-4000-8000-000000000001";

test("employee passwords are salted and reject wrong, missing and malformed credentials", async () => {
  const password = "A separate employee passphrase";
  const [first, second] = await Promise.all([hashEmployeePassword(password), hashEmployeePassword(password)]);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyEmployeePassword(password, first), true);
  assert.equal(await verifyEmployeePassword("wrong password", first), false);
  assert.equal(await verifyEmployeePassword(password, null), false);
  assert.equal(await verifyEmployeePassword(password, "scrypt:bad:bad"), false);
  for (const value of ["x".repeat(9), "x".repeat(129), 1234567890, null]) assert.equal(validEmployeePassword(value), false);
  assert.equal(validEmployeePassword("x".repeat(10)), true);
  assert.equal(validEmployeePassword("x".repeat(128)), true);
});

test("individual cookies bind identity, role, credential version and the 12-hour expiry", () => {
  const now = Date.parse("2026-11-02T15:00:00Z");
  const token = employeeSessionValueFor({ id: employeeId, role: "staff", version: 3 }, now);
  assert.deepEqual(employeeClaimsFromSession(token, now), { id: employeeId, role: "staff", version: 3, expires: now / 1000 + BTB_EMPLOYEE_MAX_AGE });
  assert.equal(employeeClaimsFromSession(token, now + BTB_EMPLOYEE_MAX_AGE * 1000), null);
  const parts = token.split(".");
  const altered = Buffer.from(JSON.stringify({ ...employeeClaimsFromSession(token, now), role: "manager" })).toString("base64url");
  assert.equal(employeeClaimsFromSession(`employee.${altered}.${parts[2]}`, now), null);
  assert.equal(employeeClaimsFromSession(`${token}.extra`, now), null);
  assert.equal(employeeClaimsFromSession(token.slice(0, -4), now), null);
});

test("employee records require contact details and role-limited management", () => {
  const person = { name: "Taylor Lee", email: "taylor@example.test", phone: "306-555-0123", position: "Kitchen", role: "staff", active: true };
  assert.equal(validateEmployee(person), null);
  for (const bad of [{ email: "" }, { phone: "" }, { name: " " }, { active: "true" }, { role: "admin" }]) assert.ok(validateEmployee({ ...person, ...bad }));
  assert.equal(employeeEditableBy("supervisor", "staff"), true);
  assert.equal(employeeEditableBy("supervisor", "manager"), false);
  assert.equal(employeeEditableBy("supervisor", "supervisor"), false);
  assert.equal(employeeEditableBy("manager", "manager"), true);
  assert.equal(employeeEditableBy("corporate", "staff"), false);
  assert.equal(attributionName({ employeeId: null, role: "manager", email: "manager@example.test", name: "Demo name" }), "Manager (shared workspace)");
});

test("operational dates use Saskatchewan and validate real calendar dates and bounded versions", () => {
  assert.equal(btbToday(new Date("2027-01-01T03:00:00Z")), "2026-12-31");
  assert.equal(btbToday(new Date("2027-01-01T06:00:00Z")), "2027-01-01");
  assert.equal(isIsoDate("2028-02-29"), true);
  for (const date of ["2026-02-29", "2026-11-31", "2026-1-01", "tomorrow"]) assert.equal(isIsoDate(date), false);
  for (const value of [-1, 1.5, "1", Infinity, 2_147_483_647]) assert.equal(isVersion(value), false);
});

test("overnight overlap includes the next day but permits touching shift boundaries", () => {
  const night: BtbShift = { id: "night", employee_id: employeeId, shift_date: "2026-11-02", start_time: "20:00", end_time: "02:00", ends_next_day: true, duty: "closing", version: 1, updated_by_name: "Manager", updated_at: "" };
  const morning = { ...night, id: "morning", shift_date: "2026-11-03", start_time: "01:00", end_time: "08:00", ends_next_day: false };
  assert.equal(shiftsOverlap(night, morning), true);
  assert.equal(shiftsOverlap(night, { ...morning, start_time: "02:00" }), false);
  assert.equal(shiftsOverlap(night, { ...morning, employee_id: "another" }), false);
  assert.equal(shiftInterval({ ...night, ends_next_day: false }), null);
  assert.equal(shiftInterval({ ...night, start_time: "01:00" }), null);
});

test("order quantities reject invalid numbers and duplicates rather than storing corrupted snapshots", () => {
  const item = { item_name: "Buns", par: 20.5, on_hand: 2 };
  assert.equal(validOrderLines([item]), true);
  assert.equal(validOrderLines([item, item]), false);
  for (const value of [-1, Infinity, NaN, "12", 100001]) assert.equal(validOrderLines([{ ...item, par: value }]), false);
});

test("training percentages count only manager-approved current published revisions", () => {
  const topic = (id: string, revision = 1, published = true): BtbTrainingTopic => ({ id, revision, published, title: id, category: "food_safety", est_minutes: 5, position: 1 });
  const record = (id: string, status: TrainingRecord["status"], topic_revision = 1): TrainingRecord => ({ id, employee_id: employeeId, topic_id: id, status, topic_revision, completed_sections: [], reviewed: true, notes: "", submitted_at: null, reviewed_at: null, reviewed_by_name: null, review_notes: null, version: 1, updated_at: "" });
  const progress = employeeTrainingProgress(employeeId, [topic("approved"), topic("pending"), topic("updated", 2), topic("draft", 1, false)], [record("approved", "approved"), record("pending", "pending"), record("updated", "approved"), record("draft", "approved")]);
  assert.deepEqual(progress, { total: 3, approved: 1, pending: 1, inProgress: 0, needsUpdate: 1, changesRequested: 0, percent: 33 });
  assert.equal(employeeTrainingProgress("another", [topic("approved")], [record("approved", "approved")]).approved, 0);
  const sections = [{ id: "one", topic_id: "topic", position: 1, heading: "Hand washing", body: "Wash hands." }];
  assert.equal(validTrainingSelection(["one"], sections), true);
  assert.equal(validTrainingSelection(["one", "one"], sections), false);
  assert.equal(validTrainingSelection(["other"], sections), false);
});

test("reminders use the nearest reached window across missed days, leap years and overdue dates", () => {
  const windows = [30, 7, 1, 0];
  assert.equal(reminderLead("2026-12-05", "2026-11-02", windows), null);
  assert.equal(reminderLead("2026-12-02", "2026-11-02", windows), 30);
  assert.equal(reminderLead("2026-11-07", "2026-11-02", windows), 7);
  assert.equal(reminderLead("2026-11-03", "2026-11-02", windows), 1);
  assert.equal(reminderLead("2026-10-30", "2026-11-02", windows), 0);
  assert.equal(reminderLead("2028-03-01", "2028-02-29", windows), 1);
  assert.equal(reminderLead("invalid", "2026-11-02", windows), null);
});

test("reminder settings require both recipient groups when enabled and deduplicate addresses", () => {
  const settings = { version: 1, enabled: true, manager_emails: ["manager@example.test"], corporate_emails: ["hq@example.test"], lead_days: [30, 7, 0] };
  assert.equal(validateReminderSettings(settings), null);
  for (const invalid of [{ manager_emails: [] }, { corporate_emails: [] }, { manager_emails: ["bad"] }, { lead_days: [] }, { lead_days: [-1] }, { lead_days: [1.1] }, { lead_days: [366] }]) assert.ok(validateReminderSettings({ ...settings, ...invalid }));
  assert.equal(validateReminderSettings({ ...settings, enabled: false, manager_emails: [], corporate_emails: [] }), null);
  assert.deepEqual(parseReminderEmails("Manager@Example.test, hq@example.test;manager@example.test\n"), ["manager@example.test", "hq@example.test"]);
  assert.equal(reminderKey("staff", "one", "2026-11-02", 0, "HQ@example.test"), reminderKey("staff", "one", "2026-11-02", 0, "hq@example.test"));
});

test("email retries respect active leases, attempt limits and provider idempotency expiry", () => {
  const now = Date.parse("2026-11-02T15:00:00Z");
  const job = { status: "failed", attempts: 1, lease_until: null, first_attempt_at: new Date(now - 3600_000).toISOString(), delivery_uncertain: true } as ReminderJob;
  assert.equal(reminderCanRetry(job, now), true);
  assert.equal(reminderCanRetry({ ...job, lease_until: new Date(now + 1000).toISOString() }, now), false);
  assert.equal(reminderCanRetry({ ...job, attempts: 3 }, now), false);
  assert.equal(reminderCanRetry({ ...job, status: "sent" }, now), false);
  assert.equal(reminderCanRetry({ ...job, first_attempt_at: new Date(now - 23 * 3600_000).toISOString() }, now), false);
  assert.equal(reminderCanRetry({ ...job, first_attempt_at: new Date(now - 24 * 3600_000).toISOString(), delivery_uncertain: false }, now), true);
  const message = reminderMessage({ source: "staff", document_name: "Taylor · food handler", expiry_date: "2026-11-02", lead_days: 7 });
  assert.ok(message.text.includes("Taylor · food handler"));
  assert.ok(message.text.includes("2026-11-02"));
  assert.deepEqual(message, reminderMessage({ source: "staff", document_name: "Taylor · food handler", expiry_date: "2026-11-02", lead_days: 7 }));
});
