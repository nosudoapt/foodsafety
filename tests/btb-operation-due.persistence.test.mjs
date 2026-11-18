import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPlatformDatabase, seedPlatform, IDS, call } from "./helpers/btb-platform-database.mjs";

const migration = readFileSync(new URL("../supabase/fix-btb-operation-due.sql", import.meta.url), "utf8");
test("DB-05 / DB-06: historical early completion reproduces; database guards checklist, Celsius and PPM with configured business time", async (t) => {
  const db = await createPlatformDatabase("operations"); t.after(() => db.close()); await seedPlatform(db);
  const ctx = { p_actor: IDS.manager, p_session: 1, p_location: IDS.a };
  await call(db, "btb_platform_configure_operations", { ...ctx, p_profile: IDS.uploader, p_data: { effective_from: "2020-01-01", kind: "opening", tasks: [{ id: "a", text: "Inspect" }], equipment: [{ name: "QA cooler", min: 0, max: 4 }] } });
  const eq = (await db.query("SELECT id FROM equipment")).rows[0].id;
  const check = { ...ctx, p_actor: IDS.staff, p_date: "2099-01-01", p_kind: "opening", p_version: 0, p_changes: [{ id: "a", completed: true }], p_notes: "" };
  const reading = { ...ctx, p_actor: IDS.staff, p_profile: IDS.uploader, p_data: { kind: "temperature", date: "2099-01-01", slot: "11:00", version: 0, value: 2, equipment_id: eq } };
  assert.equal((await call(db, "btb_platform_save_check", check)).completed, true);
  assert.equal((await call(db, "btb_platform_save_reading", reading)).temperature, 2);
  await db.exec(migration); await db.exec(migration);
  const before = (await db.query("SELECT count(*)::int n FROM btb_events")).rows[0].n;
  await assert.rejects(call(db, "btb_platform_save_check", { ...check, p_version: 1 }), /not due/);
  await assert.rejects(call(db, "btb_platform_save_reading", { ...reading, p_data: { ...reading.p_data, version: 1 } }), /not due/);
  await assert.rejects(call(db, "btb_platform_save_reading", { ...reading, p_data: { kind: "sanitizer", date: "2099-01-01", slot: "11:00", version: 0, value: 250 } }), /not due/);
  assert.equal((await db.query("SELECT count(*)::int n FROM btb_events")).rows[0].n, before, "No failed-call audit or partial evidence");
  assert.equal((await call(db, "btb_platform_save_check", { ...check, p_date: "2099-01-02", p_changes: [{ id: "a", completed: false }] })).completed, false, "Future incomplete draft is not completion evidence");
  assert.equal((await call(db, "btb_platform_save_check", { ...check, p_date: "2020-01-02" })).completed, true, "Historical correction remains valid");
  assert.equal((await call(db, "btb_platform_save_reading", { ...reading, p_data: { ...reading.p_data, date: "2020-01-02" } })).temperature, 2);
  // Test the same pure timezone calculation at DST and overnight boundaries;
  // mutation triggers always supply server clock_timestamp, never caller time.
  // Use an explicit DST-observing fixture; current IANA Edmonton rules need
  // not retain a historical winter offset forever.
  await db.query("UPDATE btb_location_settings SET timezone='America/New_York' WHERE location_id=$1", [IDS.a]);
  const due = async (date, slot, now) => (await db.query("SELECT btb_operation_is_due($1,$2,$3,$4) due", [IDS.a, date, slot, now])).rows[0].due;
  assert.equal(await due("2026-03-08", "11:00", "2026-03-08T14:59:59Z"), false);
  assert.equal(await due("2026-03-08", "11:00", "2026-03-08T15:00:00Z"), true);
  assert.equal(await due("2026-11-01", "11:00", "2026-11-01T15:59:59Z"), false);
  assert.equal(await due("2026-11-01", "11:00", "2026-11-01T16:00:00Z"), true);
  assert.equal(await due("2026-11-01", null, "2026-11-01T08:59:59Z"), false, "Before 04:00 the prior business date still applies");
  assert.equal(await due("2026-11-01", null, "2026-11-01T09:00:00Z"), true);
  assert.equal(await due("2026-11-01", "02:00", "2026-11-02T06:59:59Z"), false);
  assert.equal(await due("2026-11-01", "02:00", "2026-11-02T07:00:00Z"), true);
  await db.query("UPDATE btb_location_settings SET timezone=NULL WHERE location_id=$1", [IDS.a]);
  assert.equal(await due("2020-01-02", "11:00", "2026-11-01T18:00:00Z"), false, "Unconfigured timezone fails closed");
});
