import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_ATTEMPTS,
  QUEUE_LIMIT,
  drain,
  enqueue,
  memoryStore,
  newOp,
  pendingCount,
  shouldQueue,
  type OfflineOp,
} from "../src/lib/offline-queue";

// Phase 5 — offline sync. Prep saves and temperature readings that fail while
// the tablet has no signal park in IndexedDB and replay on the next load or
// the browser's 'online' event. The store is injected so every path runs
// under node:test.

test("schema errors are not queued — the owner has to run the migration", () => {
  assert.equal(shouldQueue('relation "prep_counts" does not exist'), false);
  assert.equal(shouldQueue('column prep_counts.pull does not exist'), false);
  assert.equal(shouldQueue("duplicate key value violates unique constraint"), false);
  assert.equal(shouldQueue("new row violates row-level security policy"), false);
});

test("connectivity failures (and blank errors) are queued", () => {
  assert.equal(shouldQueue("TypeError: Failed to fetch"), true);
  assert.equal(shouldQueue("NetworkError when attempting to fetch resource"), true);
  assert.equal(shouldQueue("fetch failed"), true);
  assert.equal(shouldQueue(null), true);
  assert.equal(shouldQueue(undefined), true);
  assert.equal(shouldQueue("Some unfamiliar timeout"), true);
});

test("enqueue parks newest-first and trims past the cap", async () => {
  const store = memoryStore();
  for (let i = 0; i < QUEUE_LIMIT + 5; i++) {
    await enqueue(store, newOp("prep_save", `op ${i}`, { i }));
  }
  const ops = await store.read();
  assert.equal(ops.length, QUEUE_LIMIT, `queue must cap at ${QUEUE_LIMIT}`);
  assert.equal(ops[0].label, `op ${QUEUE_LIMIT + 4}`, "newest op is at the front");
  assert.equal(ops[ops.length - 1].label, "op 5", "the oldest extras were trimmed");
});

test("drain replays oldest-first and clears what succeeded", async () => {
  const store = memoryStore();
  const older = newOp("prep_save", "first", {}, new Date("2026-10-04T06:00:00Z"));
  const newer = newOp("prep_save", "second", {}, new Date("2026-10-04T07:00:00Z"));
  await enqueue(store, newer);
  await enqueue(store, older);

  const order: string[] = [];
  const res = await drain(store, async (op) => {
    order.push(op.label);
  });

  assert.deepEqual(order, ["first", "second"], "oldest queued op replays first");
  assert.deepEqual(res, { sent: 2, failed: 0, dropped: 0, remaining: 0 });
  assert.equal((await store.read()).length, 0);
});

test("a failing send keeps the op for the next drain", async () => {
  const store = memoryStore();
  await enqueue(store, newOp("prep_save", "flaky", {}));

  const fail = await drain(store, async () => {
    throw new Error("still offline");
  });
  assert.equal(fail.failed, 1);
  assert.equal(fail.remaining, 1);
  assert.equal((await store.read())[0].attempts, 1, "attempts must be tracked");

  const ok = await drain(store, async () => {});
  assert.equal(ok.sent, 1);
  assert.equal((await store.read()).length, 0, "a recovered send clears the op");
});

test("an op that never succeeds is dropped, not parked forever", async () => {
  const store = memoryStore();
  await enqueue(store, newOp("temp_record", "doomed", {}));

  let last = { sent: 0, failed: 0, dropped: 0, remaining: 1 };
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    last = await drain(store, async () => {
      throw new Error("boom");
    });
  }
  assert.equal(last.dropped, 1);
  assert.equal(last.remaining, 0, `ops drop after ${MAX_ATTEMPTS} attempts`);
});

test("kinds filter so a page only replays its own ops", async () => {
  const store = memoryStore();
  await enqueue(store, newOp("prep_save", "prep", {}));
  await enqueue(store, newOp("temp_record", "temp", {}));
  assert.equal(await pendingCount(store, ["prep_save"]), 1);
  assert.equal(await pendingCount(store, ["temp_record"]), 1);
  assert.equal(await pendingCount(store), 2);

  const seen: string[] = [];
  await drain(store, async (op) => {
    seen.push(op.kind);
  }, ["temp_record"]);
  assert.deepEqual(seen, ["temp_record"]);
  const left = await store.read();
  assert.equal(left.length, 1, "the other kind survives untouched");
  assert.equal(left[0].kind, "prep_save");
});

test("queued payloads carry everything the replay needs", async () => {
  const prep = newOp("prep_save", "Prep sheet · 2026-10-04", {
    date: "2026-10-04",
    scope: "location_id.is.null",
    rows: [
      { item_name: "Burger patties", par: 40, on_hand: 12, pull: 0, urgent: true, count_date: "2026-10-04", location_id: "loc-1" },
    ],
  });
  const temp = newOp("temp_record", "Fridge 1 · 3.4°C", {
    user_id: "u1",
    recorded_at: "2026-10-04T10:15:00.000Z",
    temperature: 3.4,
    is_safe: true,
  });

  for (const op of [prep, temp] as OfflineOp[]) {
    assert.equal(op.attempts, 0);
    assert.ok(op.id.length > 0);
    assert.ok(!Number.isNaN(Date.parse(op.created_at)));
  }
  const prepPayload = prep.payload as { date: string; scope: string; rows: unknown[] };
  assert.equal(prepPayload.date, "2026-10-04");
  assert.equal(prepPayload.scope, "location_id.is.null");
  assert.equal(prepPayload.rows.length, 1, "the replay re-inserts the exact rows that were saved");
  const tempPayload = temp.payload as { recorded_at: string };
  assert.equal(tempPayload.recorded_at, "2026-10-04T10:15:00.000Z", "an offline reading keeps its real time");
});

// --- page wiring -----------------------------------------------------------

const ROOT = join(__dirname, "../..");
const prepSource = readFileSync(join(ROOT, "src/app/between-the-buns/prep-list/page.tsx"), "utf8");
const tempSource = readFileSync(join(ROOT, "src/app/temperatures/page.tsx"), "utf8");

test("the prep sheet parks failed saves and replays them", () => {
  assert.ok(prepSource.includes('from "@/lib/offline-queue"'));
  assert.ok(prepSource.includes("shouldQueue(fail.message)"), "connectivity failures must queue");
  assert.ok(prepSource.includes('newOp("prep_save"'));
  assert.ok(prepSource.includes('drain(queue, sendQueuedSave, PREP_KINDS)'));
  assert.ok(
    prepSource.includes('window.addEventListener("online", onOnline)'),
    "replay must also fire when the browser comes back online",
  );
});

test("temperature readings park failed saves and replay them", () => {
  assert.ok(tempSource.includes('from "@/lib/offline-queue"'));
  assert.ok(tempSource.includes("shouldQueue(error.message)"));
  assert.ok(tempSource.includes('newOp("temp_record"'));
  assert.ok(tempSource.includes("drain(queue, sendQueuedRecord, TEMP_KINDS)"));
  assert.ok(tempSource.includes('window.addEventListener("online", onOnline)'));
  assert.ok(
    tempSource.includes("recorded_at: new Date().toISOString()"),
    "recorded_at is frozen at entry time so an offline reading keeps its real moment",
  );
});

test("both pages tell the user when a save is waiting to sync", () => {
  for (const source of [prepSource, tempSource]) {
    assert.ok(source.includes("offlinePending > 0"), "a pending banner must render");
    assert.ok(source.includes("stored on this device"));
  }
});
