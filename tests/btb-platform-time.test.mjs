import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPlatformDatabase, seedPlatform, IDS, call } from "./helpers/btb-platform-database.mjs";

const manager = { p_actor: IDS.manager, p_session: 1, p_location: IDS.a };
const staff = { ...manager, p_actor: IDS.staff };
const run = (db, context, action, data, request = randomUUID()) => call(db, "btb_platform_time", { ...context, p_action: action, p_data: data, p_request: request });
const read = (db, context, start = "2020-11-02") => call(db, "btb_platform_time_read", { ...context, p_start: start });
async function fixture(t) { const db = await createPlatformDatabase(); t.after(() => db.close()); await seedPlatform(db); return db; }

test("employee-only clocking is idempotent, originals are immutable, corrections require reasons and approval cannot be self-issued", async (t) => {
  const db = await fixture(t); await db.exec("SET ROLE service_role");
  const request = randomUUID(); let entry = await run(db, staff, "clock_in", {}, request);
  const replay = await run(db, staff, "clock_in", {}, request); assert.equal(replay.recorded_in, entry.recorded_in);
  assert.equal((await read(db, staff)).open_entry.id, entry.id);
  await assert.rejects(run(db, staff, "clock_in", {}), /Already clocked in/);
  await assert.rejects(run(db, manager, "clock_out", { id: entry.id, version: 1, break_minutes: 0 }), /Only the employee/);
  entry = await run(db, staff, "clock_out", { id: entry.id, version: 1, break_minutes: 0 });
  const punches = { start: entry.recorded_in, end: entry.recorded_out };
  const correction = { id: entry.id, version: entry.version, effective_in: "2020-11-03T16:00:00Z", effective_out: "2020-11-04T00:00:00Z", break_minutes: 30 };
  await assert.rejects(run(db, staff, "correct", correction), /Correction reason/);
  entry = await run(db, staff, "correct", { ...correction, reason: "Fixture missed punch" });
  assert.equal(entry.recorded_in, punches.start); assert.equal(entry.recorded_out, punches.end); assert.equal(entry.work_date, "2020-11-03");
  await assert.rejects(run(db, staff, "approve", { id: entry.id, version: entry.version }), /self-approval/);
  entry = await run(db, manager, "request_changes", { id: entry.id, version: entry.version, reason: "Confirm break duration" });
  assert.equal(entry.status, "changes_requested");
  entry = await run(db, staff, "correct", { ...correction, version: entry.version, reason: "Break verified as 30 minutes" });
  entry = await run(db, manager, "approve", { id: entry.id, version: entry.version });
  assert.equal(entry.status, "approved"); assert.equal(entry.reviewed_by, IDS.manager);
  await assert.rejects(run(db, staff, "correct", { ...correction, version: entry.version, reason: "Change approved hours" }), /Reopen approval/);
  const data = await read(db, manager); assert.equal(data.entries.length, 1); assert.equal(data.history.length, 6);
  entry = await run(db, manager, "reopen", { id: entry.id, version: entry.version, reason: "Accountant correction" }); assert.equal(entry.status, "pending");
  await assert.rejects(db.query("UPDATE btb_time_entries SET recorded_in=recorded_in-interval '1 hour' WHERE id=$1", [entry.id]), /immutable/);
  await assert.rejects(db.exec("UPDATE btb_time_commands SET action='overwrite'"), /permission denied/);
});

test("overnight and DST corrections use instants and the configured business-day cutoff; team privacy and scope remain enforced", async (t) => {
  const db = await fixture(t);
  let entry = await run(db, staff, "clock_in", {});
  entry = await run(db, staff, "correct", { id: entry.id, version: 1, effective_in: "2020-11-01T01:30:00-06:00", effective_out: "2020-11-01T01:30:00-07:00", break_minutes: 0, reason: "DST fixture" });
  assert.equal(entry.work_date, "2020-10-31"); assert.equal(Date.parse(entry.effective_out) - Date.parse(entry.effective_in), 3_600_000);
  let other = await run(db, manager, "clock_in", {});
  other = await run(db, manager, "correct", { id: other.id, version: 1, effective_in: "2020-10-31T18:00:00Z", effective_out: "2020-11-01T02:00:00Z", break_minutes: 0, reason: "Manager fixture" });
  assert.equal((await read(db, staff, "2020-10-26")).entries.length, 1, "staff see only their own actual hours");
  assert.equal((await read(db, manager, "2020-10-26")).entries.length, 2);
  await assert.rejects(run(db, manager, "approve", { id: other.id, version: other.version }), /self-approval/);
  await assert.rejects(run(db, { ...manager, p_actor: IDS.owner, p_location: IDS.b }, "approve", { id: entry.id, version: entry.version }), /outside this location/);
  await assert.rejects(run(db, staff, "correct", { id: entry.id, version: entry.version, effective_in: "2020-11-01T00:00:00Z", effective_out: "2020-11-03T00:00:00Z", break_minutes: 0, reason: "Invalid stale clock" }), /Invalid correction/);
  await assert.rejects(read(db, { ...staff, p_session: 9 }), /Personal session required/);
  await db.exec("SET ROLE authenticated"); await assert.rejects(read(db, manager), /permission denied/); await assert.rejects(db.exec("SELECT * FROM btb_time_entries"), /permission denied/);
});

test("scoped schedules enforce location membership, versions, overlap and cancellation; legacy saves cannot touch scoped records", async (t) => {
  const db = await fixture(t);
  const schedule = (context, action, data) => call(db, "btb_platform_schedule", { ...context, p_action: action, p_data: data });
  const form = { id: randomUUID(), version: 0, employee_id: IDS.staff, shift_date: "2020-11-03", start_time: "09:00", end_time: "17:00", ends_next_day: false, duty: "opening" };
  const shift = await schedule(manager, "save", form); assert.equal(shift.location_id, IDS.a);
  await assert.rejects(schedule(manager, "save", { ...form, id: randomUUID(), start_time: "16:00", end_time: "20:00" }), /Overlapping shift/);
  await assert.rejects(schedule(staff, "save", { ...form, id: randomUUID() }), /Schedule lead/);
  await assert.rejects(schedule({ ...manager, p_actor: IDS.owner, p_location: IDS.b }, "save", { ...form, id: randomUUID() }), /membership/);
  await assert.rejects(call(db, "btb_save_shift", { p_id: shift.id, p_version: shift.version, p_employee_id: IDS.staff, p_date: form.shift_date, p_start: "10:00", p_end: "18:00", p_next_day: false, p_duty: "none", p_actor: "Legacy fixture" }), /location schedule/);
  await assert.rejects(schedule(manager, "delete", { id: shift.id, version: 0 }), /changed/);
  await schedule(manager, "delete", { id: shift.id, version: 1 }); assert.equal((await read(db, staff)).shifts.length, 0);
  await schedule(manager, "save", { ...form, id: randomUUID() }); assert.equal((await read(db, staff)).shifts.length, 1, "cancelled shifts do not block a replacement");
});

test("cross-location schedules compare timezone-aware instants, including midnight boundaries, not matching wall clocks", async (t) => {
  const db = await fixture(t);
  await db.query("INSERT INTO btb_location_access(location_id,employee_id) VALUES($1,$2),($1,$3)", [IDS.b, IDS.manager, IDS.staff]);
  await db.exec("SET ROLE service_role");
  const schedule = (location, shift_date, start_time, end_time, ends_next_day = false) => call(db, "btb_platform_schedule", { ...manager, p_location: location, p_action: "save", p_data: { id: randomUUID(), version: 0, employee_id: IDS.staff, shift_date, start_time, end_time, ends_next_day, duty: "service" } });
  await schedule(IDS.a, "2020-11-03", "09:00", "10:00"); // Edmonton: 16:00–17:00 UTC.
  await schedule(IDS.b, "2020-11-03", "09:00", "10:00"); // Regina: 15:00–16:00 UTC, adjacent.
  await assert.rejects(schedule(IDS.b, "2020-11-03", "10:00", "11:00"), /Overlapping shift/);
  await schedule(IDS.b, "2020-11-03", "11:00", "12:00"); // Adjacent on the other end.
  await schedule(IDS.a, "2020-11-05", "22:30", "00:30", true); // Nov 6, 05:30–07:30 UTC.
  await assert.rejects(schedule(IDS.b, "2020-11-06", "01:00", "02:00"), /Overlapping shift/);
  await schedule(IDS.b, "2020-11-06", "01:30", "02:30");
  assert.equal((await read(db, manager, "2020-11-02")).shifts.length, 2);
  assert.equal((await read(db, { ...manager, p_location: IDS.b }, "2020-11-02")).shifts.length, 3);
});

test("scoped schedules reject skipped or repeated DST boundary times but allow unambiguous shifts spanning the clock change", async (t) => {
  const db = await fixture(t); await db.exec("SET ROLE service_role");
  const schedule = (shift_date, start_time, end_time, ends_next_day = false) => call(db, "btb_platform_schedule", { ...manager, p_action: "save", p_data: { id: randomUUID(), version: 0, employee_id: IDS.staff, shift_date, start_time, end_time, ends_next_day, duty: "service" } });
  for (const [date, start, end, overnight] of [["2020-03-08", "02:15", "04:00", false], ["2020-03-08", "00:30", "02:15", false], ["2020-03-07", "23:30", "02:15", true], ["2020-11-01", "01:30", "03:00", false], ["2020-11-01", "00:30", "01:30", false], ["2020-10-31", "23:30", "01:30", true]]) {
    await assert.rejects(schedule(date, start, end, overnight), /unambiguous.*daylight-saving/);
  }
  const spring = await schedule("2020-03-08", "00:30", "03:30");
  const autumn = await schedule("2020-11-01", "00:30", "02:30");
  for (const [shift, expected] of [[spring, 120], [autumn, 180]]) {
    const result = await db.query("SELECT extract(epoch FROM (((shift_date+end_time::time) AT TIME ZONE 'America/Edmonton')-((shift_date+start_time::time) AT TIME ZONE 'America/Edmonton')))/60 AS minutes FROM btb_shifts WHERE id=$1", [shift.id]);
    assert.equal(Number(result.rows[0].minutes), expected);
  }
});

test("nearby legacy and timezone-unconfigured shifts require review; cancellation and distant history do not block new schedules", async (t) => {
  const db = await fixture(t);
  const legacy = randomUUID(), unknown = randomUUID();
  await db.query("INSERT INTO btb_shifts(id,employee_id,shift_date,start_time,end_time,duty,updated_by_name) VALUES($1,$2,'2020-11-03','18:00','22:00','service','Legacy fixture')", [legacy, IDS.staff]);
  await db.query("INSERT INTO btb_location_access(location_id,employee_id) VALUES($1,$2),($1,$3)", [IDS.b, IDS.manager, IDS.staff]);
  await db.query("UPDATE btb_location_settings SET timezone=NULL WHERE location_id=$1", [IDS.b]);
  await db.query("INSERT INTO btb_shifts(id,location_id,employee_id,shift_date,start_time,end_time,duty,updated_by_name) VALUES($1,$2,$3,'2020-11-07','10:00','18:00','service','Unconfigured fixture')", [unknown, IDS.b, IDS.staff]);
  await db.exec("SET ROLE service_role");
  const schedule = (date, location = IDS.a) => call(db, "btb_platform_schedule", { ...manager, p_location: location, p_action: "save", p_data: { id: randomUUID(), version: 0, employee_id: IDS.staff, shift_date: date, start_time: "09:00", end_time: "17:00", ends_next_day: false, duty: "service" } });
  await assert.rejects(schedule("2020-11-03"), /Review nearby legacy/);
  await assert.rejects(schedule("2020-11-04"), /Review nearby legacy/);
  await schedule("2020-11-05");
  await assert.rejects(schedule("2020-11-06"), /timezone-unconfigured/);
  await assert.rejects(schedule("2020-11-07", IDS.b), /Confirm the location timezone/);
  await db.query("UPDATE btb_shifts SET cancelled_at=now() WHERE id IN ($1,$2)", [legacy, unknown]);
  await schedule("2020-11-03"); await schedule("2020-11-07");
  assert.equal((await db.query("SELECT location_id FROM btb_shifts WHERE id=$1", [legacy])).rows[0].location_id, null, "No legacy location was guessed");
});

test("the AI helper functions are server-only, like every other platform release", async (t) => {
  const db = await fixture(t);
  const names = (await db.query("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'btb_ai_%' ORDER BY proname")).rows.map((row) => row.proname);
  assert.deepEqual(names, ["btb_ai_consume", "btb_ai_extract_prepare", "btb_ai_settings_get", "btb_ai_settings_put"]);
  for (const name of names) {
    const privileges = await db.query(
      `SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') AS server
         FROM pg_proc p
        WHERE p.pronamespace='public'::regnamespace AND p.proname=$1`,
      [name],
    );
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, server: true }, name);
  }
  await db.exec("SET ROLE anon");
  await assert.rejects(call(db, "btb_ai_settings_get", { p_actor: IDS.owner, p_session: 1, p_location: IDS.a }), /permission denied/);
});
