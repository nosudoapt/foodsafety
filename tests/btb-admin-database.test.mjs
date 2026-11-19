import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAdminDatabase, initializeAdminDatabase, seedAdmin, ADMIN_ID, PASSWORD_HASH } from "./helpers/btb-admin-database.mjs";
import { seedPlatform, IDS, call } from "./helpers/btb-platform-database.mjs";

const actor = { p_actor: ADMIN_ID, p_session: 1 };
const hash = value => createHash("sha256").update(value).digest("hex");
const inviteArgs = (location, token) => ({ ...actor, p_location: location, p_token_hash: hash(token), p_subject: "Your BTB invitation", p_body: `Set your password: /btb/login/set-password?token=${token}` });
const addPerson = (db, location, token, data = { name: "New Person", email: "person@test.invalid", role: "staff" }) => call(db, "btb_admin_add_person", { ...inviteArgs(location, token), p_data: data });

test("console SQL is idempotent, separate from employees and inaccessible to browser roles", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close());
  await seedPlatform(db); await seedAdmin(db);
  await initializeAdminDatabase(db); await initializeAdminDatabase(db);
  const sites = await call(db, "btb_admin_locations", actor);
  assert.deepEqual(sites.locations.map(site => site.id), [IDS.a, IDS.b]);
  assert.ok(sites.locations.every(site => site.pages.length === 0 && site.storage_limit_bytes === 52_428_800));
  assert.equal((await db.query("SELECT count(*)::integer n FROM btb_employees")).rows[0].n, 5, "No employees are seeded by console SQL");
  assert.equal((await db.query("SELECT count(*)::integer n FROM btb_super_admins")).rows[0].n, 1);
  await assert.rejects(call(db, "btb_admin_locations", { p_actor: IDS.manager, p_session: 1 }), /Console session required/);
  await assert.rejects(call(db, "btb_platform_bootstrap", { p_actor: ADMIN_ID, p_session: 1 }), /Personal session required/);
  await assert.rejects(call(db, "btb_admin_locations", { ...actor, p_session: 2 }), /Console session required/);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    for (const table of ["btb_super_admins", "btb_admin_login_limits", "btb_superadmin_locations", "btb_location_page_access", "btb_invitations"])
      await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
    for (const [name, args] of [["btb_admin_locations", actor], ["btb_invitation_lookup", { p_token_hash: hash("secret") }], ["btb_employee_page_grants", { p_employee: IDS.manager }]])
      await assert.rejects(call(db, name, args), /permission denied/);
    await db.exec("RESET ROLE");
  }
  await db.exec("UPDATE btb_super_admins SET active=false");
  await assert.rejects(call(db, "btb_admin_locations", actor), /Console session required/);
});

test("console location writes validate grants, preserve green locations and use optimistic versions", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close()); await seedAdmin(db);
  await db.query("INSERT INTO locations(id,name) VALUES($1,'Green location')", [IDS.b]);
  const data = { name: "BTB South", address: "12 Main Street", timezone: "America/Regina", pages: ["prep-manual", "platform", "prep-manual"] };
  const created = await call(db, "btb_admin_create_location", { ...actor, p_data: data });
  assert.equal((await call(db, "btb_admin_locations", actor)).locations.length, 1);
  await assert.rejects(call(db, "btb_admin_update_location", { ...actor, p_location: IDS.b, p_version: 1, p_data: { ...data, active: false } }), /not managed/);
  const args = { ...actor, p_location: created.id, p_version: 1, p_data: { ...data, active: false, pages: ["temperatures"] } };
  assert.deepEqual(await call(db, "btb_admin_update_location", args), { id: created.id, version: 2 });
  await assert.rejects(call(db, "btb_admin_update_location", args), /changed; reload/);
  for (const invalid of [{ ...data, timezone: "Mars/Here" }, { ...data, pages: ["admin"] }, { ...data, pages: null }, { ...data, pages: [7] }])
    await assert.rejects(call(db, "btb_admin_create_location", { ...actor, p_data: invalid }), /timezone|page/i);
  const site = (await call(db, "btb_admin_locations", actor)).locations[0];
  assert.equal(site.active, false); assert.deepEqual(site.pages, ["temperatures"]);
  assert.equal((await db.query("SELECT name FROM locations WHERE id=$1", [IDS.b])).rows[0].name, "Green location");
  const events = (await db.query("SELECT * FROM btb_events")).rows;
  assert.equal(events.length, 2); assert.ok(events.every(event => event.actor_id === null && event.actor_name === "Console: Console Admin"));
});

test("invitations create no password until single-use transactional acceptance and reuse people across locations", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close()); await seedPlatform(db); await seedAdmin(db); await initializeAdminDatabase(db);
  const invited = await addPerson(db, IDS.a, "first-token");
  const employee = (await db.query("SELECT * FROM btb_employees WHERE id=$1", [invited.employee_id])).rows[0];
  assert.equal(employee.login_enabled, false);
  assert.equal((await db.query("SELECT count(*)::integer n FROM btb_employee_credentials WHERE employee_id=$1", [employee.id])).rows[0].n, 0);
  const invitation = (await db.query("SELECT * FROM btb_invitations WHERE id=$1", [invited.invitation_id])).rows[0];
  assert.equal(invitation.token_hash, hash("first-token")); assert.equal("token" in invitation, false);
  assert.equal(new Date(invitation.expires_at) - new Date(invitation.created_at), 7 * 24 * 60 * 60 * 1000);
  const lookup = await call(db, "btb_invitation_lookup", { p_token_hash: hash("first-token") });
  assert.equal(lookup.email, "person@test.invalid"); assert.equal(lookup.location, "Location A");
  assert.equal("id" in lookup, false); assert.equal("token_hash" in lookup, false);
  assert.equal(await call(db, "btb_invitation_lookup", { p_token_hash: hash("not-a-token") }), null);
  await assert.rejects(call(db, "btb_invitation_consume", { p_token_hash: invitation.token_hash, p_password_hash: "plaintext" }), /valid password hash/);
  assert.equal((await db.query("SELECT used_at FROM btb_invitations WHERE id=$1", [invitation.id])).rows[0].used_at, null, "Invalid hash rolls back use");
  const attempts = await Promise.allSettled([1, 2].map(() => call(db, "btb_invitation_consume", { p_token_hash: invitation.token_hash, p_password_hash: PASSWORD_HASH })));
  assert.equal(attempts.filter(attempt => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(attempt => attempt.status === "rejected").length, 1);
  const session = attempts.find(attempt => attempt.status === "fulfilled").value;
  assert.equal(session.id, employee.id); assert.equal(session.session_version, 1);
  assert.equal(await call(db, "btb_invitation_lookup", { p_token_hash: invitation.token_hash }), null);
  const next = await addPerson(db, IDS.b, "second-token", { name: employee.name, email: "PERSON@test.invalid", role: employee.role });
  assert.equal(next.employee_id, employee.id);
  assert.equal((await db.query("SELECT count(*)::integer n FROM btb_location_access WHERE employee_id=$1", [employee.id])).rows[0].n, 2);
  const reset = await call(db, "btb_invitation_consume", { p_token_hash: hash("second-token"), p_password_hash: PASSWORD_HASH });
  assert.equal(reset.session_version, 2, "Password setup revokes old sessions");
  await assert.rejects(addPerson(db, IDS.a, "wrong-role", { name: employee.name, email: employee.email, role: "manager" }), /existing person/);
  assert.equal((await db.query("SELECT count(*)::integer n FROM btb_employees WHERE email='person@test.invalid'")).rows[0].n, 1);
});

test("resend, expiry, block, closure and removal invalidate tokens without deleting employee history", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close()); await seedPlatform(db); await seedAdmin(db); await initializeAdminDatabase(db);
  const first = await addPerson(db, IDS.a, "old-token");
  const resend = token => call(db, "btb_admin_reinvite", { ...inviteArgs(IDS.a, token), p_employee: first.employee_id });
  await resend("new-token");
  assert.equal(await call(db, "btb_invitation_lookup", { p_token_hash: hash("old-token") }), null);
  assert.equal((await db.query("SELECT status FROM btb_email_jobs WHERE id=$1", [first.job_id])).rows[0].status, "cancelled");
  await db.query("UPDATE btb_invitations SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [hash("new-token")]);
  await assert.rejects(call(db, "btb_invitation_consume", { p_token_hash: hash("new-token"), p_password_hash: PASSWORD_HASH }), /invalid, expired or already used/);
  const active = await resend("active-token");
  const jobs = (await db.query("SELECT * FROM btb_claim_email_jobs(20)")).rows;
  const job = jobs.find(value => value.id === active.job_id);
  assert.ok(job); assert.ok(await call(db, "btb_prepare_email_job", { p_id: job.id, p_lease: job.lease_token, p_from: "qa@test.invalid" }));
  await call(db, "btb_admin_block_person", { ...actor, p_location: IDS.a, p_employee: first.employee_id });
  assert.equal(await call(db, "btb_prepare_email_job", { p_id: job.id, p_lease: job.lease_token, p_from: "changed@test.invalid" }), null);
  assert.equal((await db.query("SELECT frozen_from FROM btb_email_jobs WHERE id=$1", [job.id])).rows[0].frozen_from, "qa@test.invalid");
  assert.equal(await call(db, "btb_invitation_lookup", { p_token_hash: hash("active-token") }), null);
  await resend("reopened-token");
  await db.query("UPDATE btb_location_settings SET active=false WHERE location_id=$1", [IDS.a]);
  await assert.rejects(call(db, "btb_invitation_consume", { p_token_hash: hash("reopened-token"), p_password_hash: PASSWORD_HASH }), /invalid, expired or already used/);
  assert.equal((await db.query("SELECT * FROM btb_claim_email_jobs(20)")).rows.length, 0);
  await assert.rejects(resend("closed-token"), /Activate the location/);
  await db.query("UPDATE btb_location_settings SET active=true WHERE location_id=$1", [IDS.a]);
  await addPerson(db, IDS.b, "other-location");
  await call(db, "btb_invitation_consume", { p_token_hash: hash("other-location"), p_password_hash: PASSWORD_HASH });
  await call(db, "btb_admin_remove_person", { ...actor, p_location: IDS.a, p_employee: first.employee_id });
  assert.equal((await db.query("SELECT active FROM btb_employees WHERE id=$1", [first.employee_id])).rows[0].active, true, "Other membership retains sign-in");
  await call(db, "btb_admin_remove_person", { ...actor, p_location: IDS.b, p_employee: first.employee_id });
  assert.equal((await db.query("SELECT active FROM btb_employees WHERE id=$1", [first.employee_id])).rows[0].active, false);
  assert.equal((await db.query("SELECT session_version FROM btb_employee_credentials WHERE employee_id=$1", [first.employee_id])).rows[0].session_version, 2);
  assert.ok((await db.query("SELECT count(*)::integer n FROM btb_events WHERE entity_id=$1", [first.employee_id])).rows[0].n >= 5);
  assert.deepEqual((await call(db, "btb_employee_page_grants", { p_employee: first.employee_id })).pageGrants, [], "Removed console person never falls back to legacy access");
});

test("page grants deny by default, union active locations and preserve truly unassigned legacy people", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close()); await seedPlatform(db); await seedAdmin(db); await initializeAdminDatabase(db);
  assert.deepEqual(await call(db, "btb_employee_page_grants", { p_employee: IDS.staff }), { locationIds: [IDS.a], pageGrants: [] });
  assert.equal((await call(db, "btb_employee_page_grants", { p_employee: IDS.owner })).pageGrants, null);
  await db.query("INSERT INTO btb_location_access(location_id,employee_id) VALUES($1,$2)", [IDS.b, IDS.staff]);
  await call(db, "btb_admin_write_pages", { p_location: IDS.a, p_pages: ["temperatures", "platform"] });
  await call(db, "btb_admin_write_pages", { p_location: IDS.b, p_pages: ["prep-manual", "platform"] });
  assert.deepEqual((await call(db, "btb_employee_page_grants", { p_employee: IDS.staff })).pageGrants, ["platform", "prep-manual", "temperatures"]);
  await db.query("UPDATE btb_location_settings SET active=false WHERE location_id=$1", [IDS.b]);
  assert.deepEqual((await call(db, "btb_employee_page_grants", { p_employee: IDS.staff })).pageGrants, ["platform", "temperatures"]);
  await call(db, "btb_admin_write_pages", { p_location: IDS.a, p_pages: [] });
  assert.deepEqual((await call(db, "btb_employee_page_grants", { p_employee: IDS.staff })).pageGrants, []);
});

test("console login limiter is atomic, bounded and separate from employee attempts", async t => {
  const db = await createAdminDatabase(); t.after(() => db.close());
  const attempts = await Promise.all(Array.from({ length: 11 }, () => call(db, "btb_consume_admin_attempt", { p_key: hash("console-email") })));
  assert.equal(attempts.filter(Boolean).length, 10);
  assert.equal((await db.query("SELECT count(*)::integer n FROM btb_login_limits")).rows[0].n, 0);
  await db.exec("UPDATE btb_admin_login_limits SET window_start=now()-interval '16 minutes'");
  assert.equal(await call(db, "btb_consume_admin_attempt", { p_key: hash("console-email") }), true);
});
