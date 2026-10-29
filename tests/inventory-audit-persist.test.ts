import { test } from "node:test";
import assert from "node:assert/strict";
import {
  persistWithAudit,
  snapshotRestoreFields,
  type SnapshotRow,
  type PersistOps,
} from "../src/lib/inventory-audit-persist";

// ---------------------------------------------------------------------------
// Regression tests for the audit-integrity fix.
//
// Before the fix, finalize/reopen `await`ed the inventory_audit_log insert and
// IGNORED its error, so the endpoint returned ok:true while writing NO audit
// row (demonstrated live: snapshot finalized, audit count 0). persistWithAudit
// must check the audit error, roll the snapshot back, and never report success
// for an unaudited write.
// ---------------------------------------------------------------------------

const base: SnapshotRow = {
  count_month: "2026-08",
  opening_value: 5000,
  closing_value: 4000,
  purchases: 2000,
  sales: 12000,
  cogs: 3000,
  food_cost_pct: 25,
  status: "finalized",
  finalized_by: "manager",
  version: 1,
};

// Build ops with instrumented counters so each test observes exactly what ran.
function instrument(overrides: Partial<PersistOps<SnapshotRow>> = {}) {
  const calls = { snapshot: 0, audit: 0, rollback: 0 };
  const ops: PersistOps<SnapshotRow> = {
    actionLabel: "finalization",
    writeSnapshot: async () => {
      calls.snapshot++;
      return { data: { ...base }, error: null };
    },
    writeAudit: async () => {
      calls.audit++;
      return { error: null };
    },
    rollback: async () => {
      calls.rollback++;
      return { error: null };
    },
    ...overrides,
  };
  return { ops, calls };
}

const AUDIT_FAILURE = { message: "permission denied for relation inventory_audit_log" };

test("happy path: snapshot + audit both succeed → ok, no rollback", async () => {
  const { ops, calls } = instrument();
  const out = await persistWithAudit("2026-08", ops);
  assert.equal(out.ok, true);
  assert.equal(out.recovered, true);
  assert.equal(out.snapshot?.count_month, "2026-08");
  assert.equal(calls.snapshot, 1);
  assert.equal(calls.audit, 1);
  assert.equal(calls.rollback, 0, "no rollback on success");
});

test("REGRESSION finalize: audit INSERT FAILS → ok:false, snapshot rolled back", async () => {
  const { ops, calls } = instrument({
    writeAudit: async () => {
      calls.audit++;
      return { error: AUDIT_FAILURE };
    },
  });
  // re-wire the counter into the override (override replaced writeAudit)
  const out = await persistWithAudit("2026-08", ops);

  assert.equal(out.ok, false, "must not report success when the audit write failed");
  assert.equal(out.stage, "audit");
  assert.equal(out.recovered, true, "a clean rollback leaves the DB consistent");
  assert.equal(calls.snapshot, 1);
  assert.ok(calls.audit >= 1, "audit write was attempted");
  assert.equal(calls.rollback, 1, "failed audit MUST trigger a compensating rollback");
  assert.match(String(out.message), /audit log write failed/i);
  assert.match(String(out.message), /permission denied/i, "error detail is surfaced, not swallowed");
});

test("REGRESSION reopen: audit INSERT FAILS → ok:false, status flip rolled back", async () => {
  const finalized: SnapshotRow = { ...base, status: "finalized", finalized_by: "admin" };
  const calls = { snapshot: 0, audit: 0, rollback: 0 };
  const ops: PersistOps<SnapshotRow> = {
    actionLabel: "reopen",
    writeSnapshot: async () => {
      calls.snapshot++;
      return { data: { ...finalized, status: "draft" }, error: null };
    },
    writeAudit: async () => {
      calls.audit++;
      return { error: { message: "canceling statement due to statement timeout" } };
    },
    rollback: async () => {
      calls.rollback++;
      return { error: null };
    },
  };
  const out = await persistWithAudit("2026-08", ops);

  assert.equal(out.ok, false, "reopen must not succeed without its audit row");
  assert.equal(out.stage, "audit");
  assert.equal(out.recovered, true);
  assert.equal(calls.rollback, 1, "the draft flip must be reverted");
  assert.match(String(out.message), /reopen rolled back/i);
});

test("audit failure + rollback FAILURE → unrecovered, explicit CRITICAL signal", async () => {
  const { ops, calls } = instrument({
    writeAudit: async () => {
      calls.audit++;
      return { error: AUDIT_FAILURE };
    },
    rollback: async () => {
      calls.rollback++;
      return { error: { message: "connection reset" } };
    },
  });
  const out = await persistWithAudit("2026-08", ops);

  assert.equal(out.ok, false);
  assert.equal(out.stage, "rollback");
  assert.equal(out.recovered, false, "explicitly flags a state needing a human");
  assert.equal(calls.rollback, 1);
  assert.match(String(out.message), /CRITICAL/i);
  assert.match(String(out.message), /2026-08/, "names the affected month for recovery");
});

test("snapshot write failure → returns early, audit never attempted", async () => {
  const { ops, calls } = instrument({
    writeSnapshot: async () => {
      calls.snapshot++;
      return { data: null, error: { message: "row is locked" } };
    },
    writeAudit: async () => {
      calls.audit++;
      return { error: null };
    },
  });
  const out = await persistWithAudit("2026-08", ops);

  assert.equal(out.ok, false);
  assert.equal(out.stage, "snapshot");
  assert.equal(calls.audit, 0, "no audit row when nothing was written");
  assert.equal(calls.rollback, 0, "nothing to roll back");
});

test("writeSnapshot resolving null data with no error is still a failure", async () => {
  const { ops, calls } = instrument({
    writeSnapshot: async () => {
      calls.snapshot++;
      return { data: null, error: null };
    },
  });
  const out = await persistWithAudit("2026-08", ops);
  assert.equal(out.ok, false, "a vanished row must not read as success");
  assert.equal(out.stage, "snapshot");
  assert.equal(calls.audit, 0);
});

test("snapshotRestoreFields restores mutable columns only (never re-keys/back-dates)", () => {
  const prior: SnapshotRow = {
    ...base,
    status: "finalized",
    reopened_by: null,
    reopened_at: null,
    reopen_reason: null,
    created_at: "2026-09-01T00:00:00Z",
  };
  const restored = snapshotRestoreFields(prior);
  assert.equal(restored.status, "finalized");
  assert.equal(restored.closing_value, 4000);
  assert.equal(restored.version, 1);
  assert.equal("count_month" in restored, false, "primary key is not restorable");
  assert.equal("created_at" in restored, false, "created_at is immutable");
});

test("snapshotRestoreFields preserves an existing reopen record on rollback", () => {
  const reopenedDraft: SnapshotRow = {
    ...base,
    status: "draft",
    reopened_by: "admin",
    reopened_at: "2026-09-02T00:00:00Z",
    reopen_reason: "miscount",
  };
  const restored = snapshotRestoreFields(reopenedDraft);
  // A rollback of a *re-finalize* must put the reopened draft back intact.
  assert.equal(restored.status, "draft");
  assert.equal(restored.reopened_by, "admin");
  assert.equal(restored.reopen_reason, "miscount");
});
