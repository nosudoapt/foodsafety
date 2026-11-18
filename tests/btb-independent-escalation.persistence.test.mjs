import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPlatformDatabase, seedPlatform, IDS, call } from "./helpers/btb-platform-database.mjs";

const migration = readFileSync(new URL("../supabase/fix-btb-independent-escalation.sql", import.meta.url), "utf8");
test("DB-13: historical email opt-out suppresses escalation; independent in-app alerts are idempotent and never opt users into email", async (t) => {
  const db = await createPlatformDatabase("api"); t.after(() => db.close()); await seedPlatform(db);
  await db.query("UPDATE btb_location_settings SET report_time='21:00',reports_enabled=false WHERE location_id=$1", [IDS.a]);
  const schedule = now => call(db, "btb_schedule_automation", { p_now: now });
  const notices = async () => (await db.query("SELECT * FROM btb_notifications WHERE location_id=$1 AND dedupe_key LIKE 'daily-incomplete:%'", [IDS.a])).rows;
  await schedule("2026-11-16T23:00:00Z"); assert.equal((await notices()).length, 0, "Historical opt-out bug reproduced");
  await db.exec(migration); await db.exec(migration);
  assert.equal((await schedule("2026-11-16T23:00:00Z")).enqueued, 0);
  const first = await notices(); assert.ok(first.length > 0); assert.ok(first.every(n => n.dedupe_key.endsWith(":2026-11-15")));
  assert.equal((await db.query("SELECT count(*)::int n FROM btb_email_jobs")).rows[0].n, 0, "Email remains opted out");
  await schedule("2026-11-16T23:00:00Z"); assert.equal((await notices()).length, first.length);
  await db.query("UPDATE btb_location_settings SET reports_enabled=true,settings_confirmed=true,manager_emails=ARRAY['qa@test.invalid'] WHERE location_id=$1", [IDS.a]);
  assert.equal((await schedule("2026-11-16T23:00:00Z")).enqueued, 1);
  assert.equal((await schedule("2026-11-16T23:00:00Z")).enqueued, 0);
  await db.query("UPDATE btb_location_settings SET reports_enabled=false,report_time=NULL WHERE location_id=$1", [IDS.a]);
  await schedule("2026-11-18T12:00:00Z");
  assert.ok((await notices()).some(n => n.dedupe_key.endsWith(":2026-11-17")), "No report cutoff uses last fully closed business day");
  const count = (await notices()).length;
  await db.query("UPDATE btb_location_settings SET active=false WHERE location_id=$1", [IDS.a]);
  await schedule("2026-11-19T12:00:00Z"); assert.equal((await notices()).length, count, "Closed site creates no alerts");
});
