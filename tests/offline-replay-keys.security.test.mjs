// OFF-06 — the server side of offline replay: stable keys, atomic receipts,
// whole-operation rollback. Exercises the exact RPCs the pages call after a
// lost response, against a real PGlite database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBtbDatabase, rpc } from "./helpers/btb-database.mjs";

const owner = "10000000-0000-4000-8000-000000000098"; // FoodSafe profile (profiles.id)
const other = "10000000-0000-4000-8000-000000000097";
const tempKey = "a".repeat(64);
const tempKey2 = "e".repeat(64);
const prepKey = "b".repeat(64);

const tempPayload = (user) => ({
  user_id: user, restaurant_name: "Between the Buns", location_id: null, equipment_name: "Fridge 1",
  record_type: "cold_storage", food_item: "Dairy", temperature: 3, min_safe_temp: 0, max_safe_temp: 4,
  is_safe: true, notes: "", recorded_at: "2026-11-19T10:00:00.000Z",
});

const prepRows = (onHand = 3) => [{ item_name: "QA item", par: 10, on_hand: onHand, pull: 1, urgent: true, count_date: "2026-11-19", location_id: null }];

async function fixture() {
  const db = await createBtbDatabase({}, { temperatureStore: true });
  await db.exec(`INSERT INTO profiles(id,restaurant_name,role) VALUES ('${owner}','Between the Buns','manager'),('${other}','The Test Kitchen','manager');`);
  await db.exec("INSERT INTO prep_counts(restaurant_name,item_name,par,on_hand,pull,urgent,count_date) VALUES ('Between the Buns','Original',5,2,1,false,'2026-11-19')");
  return db;
}

const asRole = async (db, role, subject, action) => {
  await db.exec("BEGIN");
  try {
    await db.exec(`SET LOCAL ROLE ${role}`);
    if (subject) await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [subject]);
    const result = await action();
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
};

test("OFF-06: replaying a committed temperature capture returns the original receipt without new rows, audit events, or receipts", async () => {
  const db = await fixture();
  try {
    const first = await asRole(db, "authenticated", owner, () => rpc(db, "btb_insert_temp_record", { p_data: tempPayload(owner), p_replay_key: tempKey }));
    const replay = await asRole(db, "authenticated", owner, () => rpc(db, "btb_insert_temp_record", { p_data: tempPayload(owner), p_replay_key: tempKey }));
    assert.equal(replay[0].id, first[0].id, "the retry acknowledges the original capture");
    assert.deepEqual(replay[0].recorded_at, first[0].recorded_at);
    const counts = (await db.query("SELECT (SELECT count(*) FROM temperature_records) AS records, (SELECT count(*) FROM temperature_record_events) AS events, (SELECT count(*) FROM btb_offline_receipts) AS receipts")).rows[0];
    assert.equal(Number(counts.records), 1, "no duplicate reading is written");
    assert.equal(Number(counts.events), 1, "the audit ledger is unchanged by the replay");
    assert.equal(Number(counts.receipts), 1, "exactly one receipt is recorded");
  } finally { await db.close(); }
});

test("OFF-06: a signed-in user cannot replay someone else's capture, and a mismatched payload under a known key is rejected", async () => {
  const db = await fixture();
  try {
    await asRole(db, "authenticated", owner, () => rpc(db, "btb_insert_temp_record", { p_data: tempPayload(owner), p_replay_key: tempKey }));
    await assert.rejects(
      asRole(db, "authenticated", other, () => rpc(db, "btb_insert_temp_record", { p_data: tempPayload(owner), p_replay_key: tempKey })),
      { code: "42501" },
    );
    await assert.rejects(
      asRole(db, "authenticated", owner, () => rpc(db, "btb_insert_temp_record", { p_data: { ...tempPayload(owner), temperature: 9 }, p_replay_key: tempKey })),
      { code: "22023" },
    );
    // A signed-out device must not sync someone else's capture either.
    await assert.rejects(
      asRole(db, "anon", null, () => rpc(db, "btb_insert_temp_record", { p_data: tempPayload(owner), p_replay_key: tempKey2 })),
      { code: "42501" },
    );
    // An anonymous caller claiming someone else's identity is rejected too.
    await assert.rejects(
      rpc(db, "btb_insert_temp_record", { p_data: tempPayload(owner), p_replay_key: tempKey2 }),
    );
    assert.equal(Number((await db.query("SELECT count(*) FROM temperature_records")).rows[0].count), 1);
  } finally { await db.close(); }
});

test("OFF-06: a failed prep save is atomic — previously committed rows survive and no receipt is recorded", async () => {
  const db = await fixture();
  try {
    await assert.rejects(
      rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: [{ item_name: "Abort", par: 1, on_hand: 1, pull: 0, urgent: false, location_id: "not-a-uuid" }], p_replay_key: prepKey }),
      { code: "22P02" },
    );
    const rows = (await db.query("SELECT item_name FROM prep_counts WHERE count_date='2026-11-19'")).rows;
    assert.deepEqual(rows.map((row) => row.item_name), ["Original"], "the delete rolled back with the failed insert");
    assert.equal(Number((await db.query("SELECT count(*) FROM btb_offline_receipts")).rows[0].count), 0, "no receipt acknowledged a rolled-back save");
  } finally { await db.close(); }
});

test("OFF-06: replaying a prep save under the same key leaves every count unchanged; a mismatched payload is rejected", async () => {
  const db = await fixture();
  try {
    assert.equal((await rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: prepRows(), p_replay_key: prepKey }))[0], 1);
    assert.equal((await rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: prepRows(), p_replay_key: prepKey }))[0], 1, "the replay acknowledges without rewriting rows");
    const rows = (await db.query("SELECT item_name,on_hand FROM prep_counts WHERE count_date='2026-11-19'")).rows;
    assert.deepEqual(rows.map((row) => [row.item_name, row.on_hand]), [["QA item", "3"]], "the replay did not delete-and-reinsert");
    await assert.rejects(
      rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: prepRows(99), p_replay_key: prepKey }),
      { code: "22023" },
    );
    assert.equal(Number((await db.query("SELECT count(*) FROM prep_counts WHERE count_date='2026-11-19'")).rows[0].count), 1);
  } finally { await db.close(); }
});

test("OFF-06: an actor-bound prep receipt cannot be replayed by a different signed-in user or by an anonymous caller", async () => {
  const db = await fixture();
  try {
    await asRole(db, "authenticated", owner, () => rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: prepRows(), p_replay_key: prepKey }));
    await assert.rejects(
      asRole(db, "authenticated", other, () => rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: prepRows(), p_replay_key: prepKey })),
      { code: "42501" },
    );
    await assert.rejects(
      asRole(db, "anon", null, () => rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: prepRows(), p_replay_key: prepKey })),
      { code: "42501" },
    );
    assert.equal(Number((await db.query("SELECT count(*) FROM prep_counts WHERE count_date='2026-11-19'")).rows[0].count), 1, "the accepted save replaced the stale rows exactly once and the rejected replays wrote nothing");
  } finally { await db.close(); }
});

test("OFF-06: the replay key ledger is server-only; no client role can read or forge receipts, and the key must be 64 hex chars", async () => {
  const db = await fixture();
  try {
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(asRole(db, role, role === "authenticated" ? owner : null, () => db.query("SELECT * FROM btb_offline_receipts")));
      await assert.rejects(asRole(db, role, role === "authenticated" ? owner : null, () => db.query("INSERT INTO btb_offline_receipts(replay_key,kind,args,result) VALUES ('" + "f".repeat(64) + "','temp_record','{}','{}')")));
    }
    await assert.rejects(rpc(db, "btb_insert_temp_record", { p_data: tempPayload(owner), p_replay_key: "not-a-key" }), { code: "22023" });
    await assert.rejects(rpc(db, "btb_replay_prep_save", { p_date: "2026-11-19", p_scope: null, p_rows: prepRows(), p_replay_key: "f".repeat(63) }), { code: "22023" });
  } finally { await db.close(); }
});
