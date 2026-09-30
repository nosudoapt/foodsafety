import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expiryLevel, daysUntil, isAlertLevel, sortByUrgency, alertsFrom,
  URGENCY_RANK, COMPLIANCE_TYPES, complianceType,
} from "../src/lib/expiry";

// Build an ISO date `n` days from today (local midnight).
function inDays(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

test("daysUntil and expiryLevel bucket dates correctly", () => {
  assert.equal(daysUntil(null), null);
  assert.equal(expiryLevel(null), "none");
  assert.equal(expiryLevel(inDays(-1)), "expired");
  assert.equal(expiryLevel(inDays(3)), "critical");        // <= 14
  assert.equal(expiryLevel(inDays(45), 60), "warning");     // inside 60d window
  assert.equal(expiryLevel(inDays(200), 60), "ok");         // outside window
});

test("client-specified notify windows are honoured per type", () => {
  assert.equal(complianceType("lease_agreement").notifyDays, 180);
  assert.equal(complianceType("franchise_agreement").notifyDays, 90);
  assert.equal(complianceType("health_license").notifyDays, 60);
  // A lease 150 days out is already inside its 6-month warning window...
  assert.equal(expiryLevel(inDays(150), 180), "warning");
  // ...but a health license 150 days out is still fine.
  assert.equal(expiryLevel(inDays(150), 60), "ok");
});

test("isAlertLevel flags expired/critical/warning only", () => {
  assert.equal(isAlertLevel("expired"), true);
  assert.equal(isAlertLevel("critical"), true);
  assert.equal(isAlertLevel("warning"), true);
  assert.equal(isAlertLevel("ok"), false);
  assert.equal(isAlertLevel("none"), false);
});

test("URGENCY_RANK orders expired before ok before none", () => {
  assert.ok(URGENCY_RANK.expired < URGENCY_RANK.critical);
  assert.ok(URGENCY_RANK.warning < URGENCY_RANK.ok);
  assert.ok(URGENCY_RANK.ok < URGENCY_RANK.none);
});

test("sortByUrgency surfaces expired first, then soonest expiry", () => {
  const rows = [
    { id: "ok", doc_type: "health_license", expiry_date: inDays(300) },
    { id: "expired", doc_type: "health_license", expiry_date: inDays(-5) },
    { id: "soon", doc_type: "health_license", expiry_date: inDays(10) },
    { id: "none", doc_type: "health_license", expiry_date: null },
  ];
  const order = sortByUrgency(rows, (r) => r.doc_type, (r) => r.expiry_date).map((r) => r.id);
  assert.deepEqual(order, ["expired", "soon", "ok", "none"]);
});

test("alertsFrom returns only rows needing attention, most urgent first", () => {
  const rows = [
    { id: "fine", doc_type: "health_license", expiry_date: inDays(300) },
    { id: "expired", doc_type: "health_license", expiry_date: inDays(-2) },
    { id: "warn", doc_type: "health_license", expiry_date: inDays(40) },
  ];
  const ids = alertsFrom(rows, (r) => r.doc_type, (r) => r.expiry_date).map((r) => r.id);
  assert.deepEqual(ids, ["expired", "warn"]);
});

test("every compliance type has a positive notify window and label", () => {
  for (const t of COMPLIANCE_TYPES) {
    assert.ok(t.notifyDays > 0, `${t.value} needs a notify window`);
    assert.ok(t.label.length > 0, `${t.value} needs a label`);
  }
});
