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
  retryDeadLetters,
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

test("OFF-01: enqueue retains every overflow capture as recoverable evidence", async () => {
  const store = memoryStore();
  for (let i = 0; i < QUEUE_LIMIT + 5; i++) {
    await enqueue(store, newOp("prep_save", `op ${i}`, { i }));
  }
  const ops = await store.read();
  assert.equal(ops.length, QUEUE_LIMIT + 5, "no unsynced record may be discarded");
  assert.equal(ops[0].label, `op ${QUEUE_LIMIT + 4}`, "newest op is at the front");
  assert.equal(ops[ops.length - 1].label, "op 0", "the original capture remains");
  assert.equal(ops.filter((op) => op.state === "dead_letter").length, 5);
  assert.equal(ops[0].failure_reason, "queue_overflow");
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

test("OFF-02: exhausted failures remain exportable and retry only after explicit recovery", async () => {
  const store = memoryStore();
  await enqueue(store, newOp("temp_record", "doomed", {}));

  let last = { sent: 0, failed: 0, dropped: 0, remaining: 1 };
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    last = await drain(store, async () => {
      throw new Error("boom");
    });
  }
  assert.equal(last.dropped, 0);
  assert.equal(last.remaining, 1);
  const retained = (await store.read())[0];
  assert.equal(retained.state, "dead_letter");
  assert.equal(retained.failure_reason, "send_failed");
  let automatic = 0;
  await drain(store, async () => { automatic++; });
  assert.equal(automatic, 0, "a dead letter does not spin automatic retries");
  await retryDeadLetters(store, ["temp_record"]);
  assert.deepEqual((await store.read())[0].payload, retained.payload);
  assert.equal((await store.read())[0].id, retained.id);
  assert.equal((await drain(store, async () => { automatic++; })).sent, 1);
  assert.equal(automatic, 1);
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

test("OFF-03: simultaneous enqueue serializes every read-modify-write", async () => {
  const store = memoryStore();
  await Promise.all(Array.from({ length: 100 }, (_, index) => enqueue(store, newOp("temp_record", `Capture ${index}`, { index }))));
  assert.equal((await store.read()).length, 100);
  assert.equal(new Set((await store.read()).map(op => op.id)).size, 100);
});

test("OFF-04: competing drains coordinate before reading their target snapshot", async () => {
  const store = memoryStore([newOp("temp_record", "Once", {})]);
  let sends = 0;
  await Promise.all(Array.from({ length: 20 }, () => drain(store, async () => { sends++; await Promise.resolve(); })));
  assert.equal(sends, 1);
});

test("OFF-05: enqueue inside an in-flight sender survives without lock deadlock", async () => {
  const first = newOp("temp_record", "First", {}), second = newOp("temp_record", "Later", {});
  const store = memoryStore([first]);
  await drain(store, async () => { await enqueue(store, second); });
  assert.deepEqual((await store.read()).map(op => op.id), [second.id]);
});

test("each accepted operation is acknowledged before attempting the next", async () => {
  const first = newOp("temp_record", "First", {}, new Date("2020-01-01"));
  const second = newOp("temp_record", "Second", {}, new Date("2020-01-02"));
  const store = memoryStore([first, second]);
  await drain(store, async (op) => {
    if (op.id === second.id) {
      assert.deepEqual((await store.read()).map(item => item.id), [second.id]);
      throw new Error("Second request unavailable");
    }
  });
  assert.deepEqual((await store.read()).map(op => op.id), [second.id]);
  assert.equal((await store.read())[0].attempts, 1);
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
