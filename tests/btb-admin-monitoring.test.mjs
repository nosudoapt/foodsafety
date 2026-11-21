import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createAdminDatabase, seedAdmin, ADMIN_ID } from "./helpers/btb-admin-database.mjs";
import { seedPlatform, IDS, call } from "./helpers/btb-platform-database.mjs";

const actor = { p_actor: ADMIN_ID, p_session: 1 };
const manager = { p_actor: IDS.manager, p_session: 1 };

/** Upload one file of an exact decoded size through the real (capped) RPC. */
const file = (db, size, options = {}) => call(db, "btb_platform_file_put", {
  p_actor: options.actor ?? IDS.manager, p_session: 1, p_location: options.location ?? IDS.a,
  p_data: {
    id: randomUUID(), purpose: options.purpose ?? "evidence", name: "fixture.bin", mime: "application/pdf",
    byte_size: size, sha256: createHash("sha256").update(`${size}:${options.location ?? IDS.a}`).digest("hex"),
    content_base64: Buffer.alloc(size).toString("base64"),
  },
});

const activity = (db, { type = "btb", location = IDS.a, restaurant = "Between the Buns", created_at = new Date().toISOString(), path = "/btb/demo/menu" } = {}) =>
  db.query("INSERT INTO app_activity(actor_type,actor_id,actor_name,role,restaurant_name,location_id,path,title,created_at) VALUES($1,$2,'Visitor','staff',$3,$4,$5,'Title',$6)",
    [type, randomUUID(), restaurant, location, path, created_at]);

/** Monitoring output must never carry credentials, payloads or audit deltas. */
const LEAKED_KEYS = ["before_data", "after_data", "content_base64", "sha256", "password_hash", "api_key", "token_hash"];
const assertNoSensitiveKeys = value => {
  if (Array.isArray(value)) { value.forEach(assertNoSensitiveKeys); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!LEAKED_KEYS.includes(key), `monitoring leaked ${key}`);
    assertNoSensitiveKeys(child);
  }
};

test("monitoring covers only managed locations and exposes counts, never payloads", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close());
  await seedPlatform(db); await seedAdmin(db);
  // Only explicitly managed locations are visible to the console; the platform
  // seed's locations are adopted by the console, not discovered automatically.
  await db.query("INSERT INTO btb_superadmin_locations(location_id) VALUES($1),($2)", [IDS.a, IDS.b]);
  await db.query("INSERT INTO btb_location_access(location_id,employee_id) VALUES($1,$2)", [IDS.b, IDS.manager]);
  await call(db, "btb_admin_write_pages", { p_location: IDS.a, p_pages: ["temperatures", "platform"] });
  const uploaded = await file(db, 500, { purpose: "reference" });
  await file(db, 700, { purpose: "evidence", location: IDS.b });
  await db.query("INSERT INTO btb_events(location_id,entity_type,entity_id,action,actor_name,before_data,after_data) VALUES($1,'settings',$1,'save','Someone','{\"secret\":\"before\"}','{\"secret\":\"after\"}')", [IDS.a]);
  await db.query("INSERT INTO btb_ai_usage(location_id,day,used) VALUES($1,current_date,3),($1,current_date-1,2)", [IDS.a]);
  await db.query("INSERT INTO btb_ai_settings(location_id,enabled,daily_limit) VALUES($1,true,40)", [IDS.b]);
  // Operational health: one issue of each kind, one open shift, one pending email,
  // and today's checks/readings for location A only.
  await db.query("INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,recipient,subject,body,status,error) VALUES('fixture-failed',$1,'invite','x@test.invalid','Subject','Body','failed','Mailbox unavailable')", [IDS.a]);
  await db.query("INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,recipient,subject,body,status) VALUES('fixture-pending',$1,'invite','y@test.invalid','Subject','Body','pending')", [IDS.a]);
  await db.query("INSERT INTO btb_document_imports(location_id,file_id,kind,sha256,extractor,extraction_error,accounting_month,created_by) VALUES($1,$2,'gfs',$3,'fixture','Could not read page 2','2026-11',$4)", [IDS.a, uploaded.id, "f".repeat(64), IDS.manager]);
  await db.query("INSERT INTO btb_time_entries(id,location_id,employee_id,work_date,recorded_in,effective_in,status) VALUES($1,$2,$3,current_date,now()-interval '90 minutes',now()-interval '90 minutes','open')", [randomUUID(), IDS.a, IDS.staff]);
  await db.query("INSERT INTO btb_time_entries(id,location_id,employee_id,work_date,recorded_in,recorded_out,effective_in,effective_out,break_minutes,status) VALUES($1,$2,$3,current_date,now()-interval '3 hours',now()-interval '2 hours',now()-interval '3 hours',now()-interval '2 hours',0,'changes_requested')", [randomUUID(), IDS.a, IDS.manager]);
  await db.query("INSERT INTO btb_shift_checks(location_id,check_date,check_type,completed) VALUES($1,current_date,'opening',true)", [IDS.a]);
  await db.query("INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,unit,business_date,location_id) VALUES($1,'Between the Buns','Walk-in','cold_storage','Milk',3.5,'C',current_date,$2)", [IDS.uploader, IDS.a]);
  await db.query("INSERT INTO btb_sanitizer_logs(location_id,business_date,slot,ppm,recorded_by,recorded_by_name) VALUES($1,current_date,'midday',200,$2,'Staff')", [IDS.a, IDS.staff]);
  await activity(db, { location: IDS.a });
  await activity(db, { type: "user", restaurant: "Other Client", location: IDS.a });
  await activity(db, { location: null });

  // A BTB site this console does not manage stays invisible, with its data.
  await db.query("INSERT INTO locations(id,name) VALUES($1,'Unmanaged site')", [IDS.uploader]);
  await db.query("INSERT INTO btb_location_settings(location_id,timezone) VALUES($1,'America/Regina')", [IDS.uploader]);
  await file(db, 9000, { purpose: "reference", actor: IDS.owner, location: IDS.uploader });
  await activity(db, { location: IDS.uploader });

  const data = await call(db, "btb_admin_monitoring", { ...actor, p_days: 7 });
  assertNoSensitiveKeys(data);
  assert.deepEqual(data.locations.map(site => site.id), [IDS.a, IDS.b]);
  const east = data.locations[0], west = data.locations[1];
  assert.equal(east.people, 2); assert.equal(east.pages, 2);
  assert.equal(east.files, 1); assert.equal(east.storage_bytes, 500);
  assert.deepEqual(east.file_purposes, { reference: { files: 1, bytes: 500 }, artwork: { files: 0, bytes: 0 }, evidence: { files: 0, bytes: 0 }, purchase: { files: 0, bytes: 0 }, sales: { files: 0, bytes: 0 }, compliance: { files: 0, bytes: 0 }, report: { files: 0, bytes: 0 } });
  assert.equal(east.views, 1, "FoodSafe and unattributed visits are not console activity");
  assert.equal(east.events, 2, "One upload event plus one direct event");
  assert.equal(east.ai_used, 5); assert.equal(east.ai_daily_limit, 25);
  assert.ok(east.last_seen); assert.equal(east.active, true); assert.equal(east.storage_limit_bytes, 52_428_800);
  assert.equal(west.files, 1); assert.equal(west.ai_daily_limit, 40); assert.equal(west.people, 1); assert.equal(west.pages, 0);
  assert.ok(east.last_activity, "Event-stream activity is reported separately from best-effort page visits");
  assert.ok(Number.isInteger(east.busiest_hour) && east.busiest_hour >= 0 && east.busiest_hour <= 23);
  assert.deepEqual(east.features.map(feature => feature.type), ["file", "settings"]);
  assert.deepEqual(east.problems, { failed_emails: 1, failed_imports: 1, changes_requested: 1, total: 3 });
  assert.equal(east.latest_email_error, "Mailbox unavailable");
  assert.equal(east.email_pending, 1);
  assert.equal(east.open_entries, 1, "One open shift at location A");
  assert.equal(east.checks_complete, 1); assert.equal(east.temperature_readings, 1); assert.equal(east.sanitizer_readings, 1);
  assert.ok(west.last_activity); assert.ok(Number.isInteger(west.busiest_hour));
  assert.deepEqual(west.features.map(feature => feature.type), ["file"]);
  assert.deepEqual(west.problems, { failed_emails: 0, failed_imports: 0, changes_requested: 0, total: 0 });
  assert.deepEqual(data.totals, {
    locations: 2, active_locations: 2, people: 2, files: 2, storage_bytes: 1200,
    storage_limit_bytes: 104_857_600, views: 1, events: 3, ai_used: 5,
    problems: 3, open_entries: 1, email_pending: 1,
  });
  assert.equal(data.days, 7);
  assert.equal(data.heatmap.length, 7);
  assert.ok(data.heatmap.every(row => row.length === 24));
  assert.equal(data.day_labels.length, 7);
  assert.equal(data.recent.length, 3);
  assert.deepEqual(Object.keys(data.recent[0]).sort(), ["action", "actor_name", "created_at", "entity_type", "location", "location_id"]);
  assert.equal(data.recent[0].action, "save", "Newest event first");
  assert.equal(data.recent[0].actor_name, "Someone");
  const usage = await call(db, "btb_platform_storage_usage", { ...manager, p_location: IDS.a });
  assert.deepEqual(usage, { used: 500, limit_bytes: 52_428_800, files: 1 });
  await assert.rejects(call(db, "btb_platform_storage_usage", { ...actor, p_location: IDS.a }), /Personal session required/, "The console session is not a platform identity");
});

test("the activity window is bounded and the grid buckets by UTC day and hour", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close());
  await seedPlatform(db); await seedAdmin(db);
  await db.query("INSERT INTO btb_superadmin_locations(location_id) VALUES($1),($2)", [IDS.a, IDS.b]);
  for (const days of [null, 6, 32, 0]) {
    await assert.rejects(call(db, "btb_admin_monitoring", { ...actor, p_days: days }), /7 and 31/);
  }
  const days = 14;
  const nowMs = Date.now();
  const hourStart = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const recent = new Date(hourStart - 10 * 3_600_000);
  const older = new Date(hourStart - (3 * 24 + 5) * 3_600_000);
  await activity(db, { created_at: recent.toISOString(), path: "/btb/demo/temperatures" });
  await activity(db, { created_at: older.toISOString(), path: "/btb/demo/vault" });
  const data = await call(db, "btb_admin_monitoring", { ...actor, p_days: days });
  const recentDay = days - 1 - Math.floor((nowMs - recent.getTime()) / 86_400_000);
  const olderDay = days - 1 - Math.floor((nowMs - older.getTime()) / 86_400_000);
  assert.equal(data.heatmap[recentDay][recent.getUTCHours()], 1);
  assert.equal(data.heatmap[olderDay][older.getUTCHours()], 1);
  assert.equal(data.heatmap.flat().reduce((sum, cell) => sum + cell, 0), 2, "Only the two seeded visits appear");
  const sqlToday = (await db.query("SELECT to_char(current_date,'YYYY-MM-DD') AS d")).rows[0].d;
  assert.equal(data.day_labels[days - 1], sqlToday);
  assert.equal(data.day_labels[0], new Date(new Date(`${sqlToday}T00:00:00Z`).getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10));
  assert.equal(data.days, days);
});

test("the per-location storage cap is atomic and enforced on every upload", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close());
  await seedPlatform(db); await seedAdmin(db);
  await db.query("INSERT INTO btb_location_access(location_id,employee_id) VALUES($1,$2)", [IDS.b, IDS.manager]);
  const limit = (await db.query("SELECT storage_limit_bytes FROM btb_location_settings WHERE location_id=$1", [IDS.a])).rows[0].storage_limit_bytes;
  assert.equal(limit, 52_428_800, "The console default is 50 MiB");
  await db.query("UPDATE btb_location_settings SET storage_limit_bytes=1200 WHERE location_id=$1", [IDS.a]);
  await file(db, 500);
  await file(db, 700, { purpose: "sales" });
  await assert.rejects(file(db, 1), /storage limit/);
  assert.equal((await call(db, "btb_platform_storage_usage", { ...manager, p_location: IDS.a })).used, 1200, "A rejected upload leaves no bytes behind");
  assert.equal((await db.query("SELECT count(*)::int n FROM btb_file_objects WHERE location_id=$1", [IDS.a])).rows[0].n, 2);
  assert.equal((await db.query("SELECT count(*)::int n FROM btb_events WHERE location_id=$1 AND entity_type='file'", [IDS.a])).rows[0].n, 2, "A rejected upload writes no audit event");
  // Concurrent uploads serialize per location: the aggregate can never pass the cap.
  await db.query("UPDATE btb_location_settings SET storage_limit_bytes=500 WHERE location_id=$1", [IDS.b]);
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => file(db, 100, { location: IDS.b })));
  const succeeded = attempts.filter(attempt => attempt.status === "fulfilled").length;
  assert.equal(succeeded, 5, "Exactly the remaining headroom is used");
  assert.deepEqual(await call(db, "btb_platform_storage_usage", { ...manager, p_location: IDS.b }), { used: 500, limit_bytes: 500, files: 5 });
  // Capabilities and limits are re-read on every upload.
  await assert.rejects(file(db, 10, { actor: IDS.staff, purpose: "sales" }), /Role not permitted/);
  await db.query("UPDATE btb_location_settings SET storage_limit_bytes=100 WHERE location_id=$1", [IDS.a]);
  await assert.rejects(file(db, 10), /storage limit/);
  await db.query("UPDATE btb_location_settings SET active=false WHERE location_id=$1", [IDS.a]);
  await assert.rejects(file(db, 10), /active BTB location/);
});

test("monitoring degrades when the optional time release is absent", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close());
  await seedPlatform(db); await seedAdmin(db);
  await db.query("INSERT INTO btb_superadmin_locations(location_id) VALUES($1)", [IDS.a]);
  await db.exec("DROP TABLE btb_time_entries CASCADE");
  const data = await call(db, "btb_admin_monitoring", { ...actor, p_days: 30 });
  assert.equal(data.locations[0].open_entries, 0);
  assert.equal(data.locations[0].problems.changes_requested, 0);
  assert.equal(data.totals.open_entries, 0);
});

test("monitoring and the capped uploader deny browser roles and employee sessions", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close());
  await seedPlatform(db); await seedAdmin(db);
  await assert.rejects(call(db, "btb_admin_monitoring", { ...manager, p_days: 30 }), /Console session required/);
  await assert.rejects(call(db, "btb_admin_monitoring", { ...actor, p_session: 2 }), /Console session required/);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    for (const [name, args] of [
      ["btb_admin_monitoring", { ...actor, p_days: 30 }],
      ["btb_platform_file_put", { p_actor: IDS.manager, p_session: 1, p_location: IDS.a, p_data: {} }],
      ["btb_platform_storage_usage", { p_actor: IDS.manager, p_session: 1, p_location: IDS.a }],
    ]) await assert.rejects(call(db, name, args), /permission denied/);
    await db.exec("RESET ROLE");
  }
});
