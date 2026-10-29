import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceRows, type ReplaceOps } from "../src/lib/persist-replace";

// ---------------------------------------------------------------------------
// Regression tests for the compensating-replace used by the count-sheet and
// sales saves. Before replaceRows, the page ran DELETE-old → INSERT-new with
// no recovery: if the insert failed, the month's previous rows were silently
// GONE while the UI showed a generic error.
// ---------------------------------------------------------------------------

type Row = { id: string; qty: number };
const OLD: Row[] = [{ id: "a", qty: 5 }, { id: "b", qty: 2 }];

function instrument(overrides: Partial<ReplaceOps<Row>> = {}) {
  const calls = { backup: 0, del: 0, ins: 0, restore: 0 };
  const restoredWith: Row[][] = [];
  const ops: ReplaceOps<Row> = {
    label: "count sheet save",
    backup: async () => { calls.backup++; return { rows: [...OLD], error: null }; },
    del: async () => { calls.del++; return { error: null }; },
    ins: async () => { calls.ins++; return { inserted: 3, error: null }; },
    restore: async (rows) => { calls.restore++; restoredWith.push(rows); return { error: null }; },
    ...overrides,
  };
  return { ops, calls, restoredWith };
}

test("happy path: backup → delete → insert, no restore", async () => {
  const { ops, calls } = instrument();
  const out = await replaceRows(ops);
  assert.equal(out.ok, true);
  assert.equal(out.recovered, true);
  assert.equal(out.inserted, 3);
  assert.deepEqual(calls, { backup: 1, del: 1, ins: 1, restore: 0 });
});

test("REGRESSION: insert failure restores the previous rows", async () => {
  const { ops, calls, restoredWith } = instrument({
    ins: async () => { calls.ins++; return { inserted: 0, error: { message: "permission denied" } }; },
  });
  const out = await replaceRows(ops);
  assert.equal(out.ok, false);
  assert.equal(out.stage, "insert");
  assert.equal(out.recovered, true, "a successful restore leaves the DB consistent");
  assert.equal(calls.restore, 1, "failed insert MUST restore the backup");
  assert.deepEqual(restoredWith[0], OLD, "the exact previous rows come back");
  assert.match(String(out.message), /restored/i);
});

test("backup failure aborts BEFORE any delete — nothing is lost", async () => {
  const { ops, calls } = instrument({
    backup: async () => { calls.backup++; return { rows: null, error: { message: "read timeout" } }; },
  });
  const out = await replaceRows(ops);
  assert.equal(out.ok, false);
  assert.equal(out.stage, "backup");
  assert.equal(calls.del, 0, "must never delete rows it couldn't back up");
  assert.equal(calls.ins, 0);
});

test("delete failure aborts before the insert; previous rows untouched", async () => {
  const { ops, calls } = instrument({
    del: async () => { calls.del++; return { error: { message: "connection reset" } }; },
  });
  const out = await replaceRows(ops);
  assert.equal(out.ok, false);
  assert.equal(out.stage, "delete");
  assert.equal(calls.ins, 0);
  assert.equal(calls.restore, 0, "nothing was deleted, so nothing to restore");
  assert.match(String(out.message), /still in place/i);
});

test("insert failure with NOTHING previously stored needs no restore", async () => {
  const { ops, calls } = instrument({
    backup: async () => { calls.backup++; return { rows: [], error: null }; },
    ins: async () => { calls.ins++; return { inserted: 0, error: { message: "bad row" } }; },
  });
  const out = await replaceRows(ops);
  assert.equal(out.ok, false);
  assert.equal(out.stage, "insert");
  assert.equal(calls.restore, 0, "no prior rows → nothing to restore");
  assert.equal(out.recovered, true);
});

test("insert AND restore both fail → explicit unrecovered CRITICAL signal", async () => {
  const { ops, calls } = instrument({
    ins: async () => { calls.ins++; return { inserted: 0, error: { message: "insert exploded" } }; },
    restore: async () => { calls.restore++; return { error: { message: "restore exploded" } }; },
  });
  const out = await replaceRows(ops);
  assert.equal(out.ok, false);
  assert.equal(out.stage, "restore");
  assert.equal(out.recovered, false, "must flag a state needing manual recovery");
  assert.match(String(out.message), /CRITICAL/i);
  assert.match(String(out.message), /re-enter/i, "tells the operator exactly what to do");
});
