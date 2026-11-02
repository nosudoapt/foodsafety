import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { btbDatabaseTables, createBtbDatabase, databaseRows, operationsSchema, rpc } from "./helpers/btb-database.mjs";

test("BTB SQL preserves imports, isolates credentials and enforces transactional operations", async (t) => {
  const member = randomUUID(); const duplicate = randomUUID(); const siteMember = randomUUID(); const site = randomUUID(); const licence = randomUUID(); const profile = randomUUID();
  const db = await createBtbDatabase({
    locations: [{ id: site }], profiles: [{ id: profile }],
    staff_members: [{ id: member, name: "Imported Alice", email: "alice@example.test", location_id: null, created_at: "2020-01-01T00:00:00Z" }, { id: duplicate, name: "Duplicate email", email: "ALICE@example.test", created_at: "2020-01-02T00:00:00Z" }, { id: siteMember, name: "Site employee", email: "site@example.test", location_id: site }],
    staff_shifts: [{ staff_member_id: member, shift_date: "2020-01-01", start_time: "09:00", end_time: "17:00", location_id: null }, { staff_member_id: siteMember, shift_date: "2020-01-01", location_id: site }],
    order_sheets: [{ item_name: "Legacy buns", order_date: "2020-01-01", par: 12, on_hand: 3 }, { item_name: "Site order", order_date: "2020-01-01", location_id: site }],
    btb_checklists: [{ check_date: "2020-01-01", check_type: "opening", items: [{ id: "o1", completed: true }], done_count: 1, total_count: 20 }],
    new_restaurant_tasks: [{ task: "Legacy launch task", phase: "Existing work", done: true }],
    staff_licenses: [{ id: licence, user_id: profile, restaurant_name: "Between the Buns", staff_name: "Imported Alice", license_type: "food_handler", file_name: "food.pdf", file_url: "data:application/pdf;base64,JVBERi0=", expiry_date: "2026-11-02" }],
  });
  t.after(() => db.close());
  let employee;
  const employeeParams = (extra = {}) => ({ p_id: member, p_version: 1, p_name: "Alice", p_email: "alice@example.test", p_phone: "306-555-0123", p_position: "Kitchen", p_role: "staff", p_active: true, p_password_hash: "initial-salted-hash", ...extra });

  await t.test("all company imports survive a reapply and source rows remain intact", async () => {
    await db.exec(operationsSchema);
    const roster = await databaseRows(db, "btb_employees");
    assert.equal(roster.length, 2);
    assert.equal(roster.find((row) => row.id === duplicate).email, null);
    assert.equal(roster.find((row) => row.id === member).login_enabled, false);
    assert.equal((await databaseRows(db, "staff_members")).length, 3);
    assert.equal((await databaseRows(db, "btb_shifts")).length, 1);
    const orders = await databaseRows(db, "btb_order_sheets");
    assert.deepEqual(orders[0].lines, [{ item_name: "Legacy buns", par: 12, on_hand: 3 }]);
    assert.equal((await databaseRows(db, "order_sheets")).length, 2);
    assert.equal((await databaseRows(db, "btb_order_revisions")).length, 1);
    assert.equal((await databaseRows(db, "btb_check_revisions")).length, 1);
    assert.equal((await databaseRows(db, "btb_franchise_tasks"))[0].task, "Legacy launch task");
    assert.equal((await databaseRows(db, "btb_staff_licences"))[0].id, licence);
  });

  await t.test("anon and authenticated roles cannot read operational tables or execute account RPCs", async () => {
    for (const table of btbDatabaseTables) {
      const permissions = await db.query("SELECT has_table_privilege('anon',$1,'SELECT') AS anon, has_table_privilege('authenticated',$1,'SELECT') AS authenticated, has_table_privilege('service_role',$1,'SELECT') AS server", [table]);
      assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, server: true });
    }
    const permissions = await db.query("SELECT has_function_privilege('anon','public.btb_consume_login_attempt(text)','EXECUTE') AS allowed");
    assert.equal(permissions.rows[0].allowed, false);
  });

  await t.test("employee credentials and identity changes commit together and stale updates fail", async () => {
    [employee] = await rpc(db, "btb_save_employee", employeeParams());
    assert.equal(employee.login_enabled, true);
    assert.equal(employee.version, 2);
    assert.equal((await databaseRows(db, "btb_employee_credentials"))[0].session_version, 1);
    await assert.rejects(rpc(db, "btb_save_employee", employeeParams({ p_name: "Stale overwrite" })), { code: "40001" });
    [employee] = await rpc(db, "btb_save_employee", employeeParams({ p_version: 2, p_role: "supervisor", p_password_hash: null }));
    assert.equal((await databaseRows(db, "btb_employee_credentials"))[0].session_version, 2);
    await assert.rejects(rpc(db, "btb_save_employee", employeeParams({ p_id: null, p_version: 0 })), { code: "23505" });
    assert.equal((await databaseRows(db, "btb_employee_credentials")).length, 1);
  });

  await t.test("the login limiter counts concurrent attempts and resets its expired window", async () => {
    const attempts = await Promise.all(Array.from({ length: 11 }, () => rpc(db, "btb_consume_login_attempt", { p_key: "hashed-email" })));
    assert.equal(attempts.filter(([allowed]) => allowed).length, 10);
    await db.exec("UPDATE btb_login_limits SET window_start=now()-interval '16 minutes'");
    assert.deepEqual(await rpc(db, "btb_consume_login_attempt", { p_key: "hashed-email" }), [true]);
  });

  await t.test("overnight shifts reject next-day overlaps and missing/stale records", async () => {
    const params = { p_id: null, p_version: 0, p_employee_id: member, p_date: "2026-11-02", p_start: "20:00", p_end: "02:00", p_next_day: true, p_duty: "closing", p_actor: "Supervisor (shared workspace)" };
    const [night] = await rpc(db, "btb_save_shift", params);
    await assert.rejects(rpc(db, "btb_save_shift", { ...params, p_date: "2026-11-03", p_start: "01:00", p_end: "08:00", p_next_day: false }), { code: "23P01" });
    const [morning] = await rpc(db, "btb_save_shift", { ...params, p_date: "2026-11-03", p_start: "02:00", p_end: "08:00", p_next_day: false, p_duty: "opening" });
    assert.ok(morning.id !== night.id);
    await assert.rejects(rpc(db, "btb_save_shift", { ...params, p_id: randomUUID() }), { code: "40001" });
  });

  await t.test("competing order saves produce one immutable revision and roll back if snapshot persistence fails", async () => {
    const params = { p_date: "2026-11-02", p_lines: [{ item_name: "Buns", par: 10, on_hand: 2 }], p_version: 0, p_employee_id: member, p_actor: "Alice" };
    const results = await Promise.allSettled([rpc(db, "btb_save_order", params), rpc(db, "btb_save_order", params)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.code, "40001");
    const [updated] = await rpc(db, "btb_save_order", { ...params, p_version: 1, p_lines: [{ item_name: "Buns", par: 20, on_hand: 2 }] });
    const revisions = (await databaseRows(db, "btb_order_revisions")).filter((row) => row.sheet_id === updated.id);
    assert.equal(revisions.length, 2);
    assert.equal(revisions.find((row) => row.version === 1).lines[0].par, 10);
    await db.exec("CREATE FUNCTION reject_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test snapshot failure'; END $$; CREATE TRIGGER reject_revision BEFORE INSERT ON btb_order_revisions FOR EACH ROW EXECUTE FUNCTION reject_revision();");
    await assert.rejects(rpc(db, "btb_save_order", { ...params, p_version: 2 }));
    assert.equal((await databaseRows(db, "btb_order_sheets")).find((row) => row.id === updated.id).version, 2);
    await db.exec("DROP TRIGGER reject_revision ON btb_order_revisions; DROP FUNCTION reject_revision();");
  });

  await t.test("checks retain attributed revisions and reject conflicting saves", async () => {
    const items = [{ id: "o1", completed: true, completed_by: member, completed_by_name: "Alice" }, { id: "o2", completed: false }];
    const params = { p_date: "2026-11-02", p_type: "opening", p_version: 0, p_items: items, p_notes: "Handover", p_employee_id: member, p_actor: "Alice" };
    const [check] = await rpc(db, "btb_save_shift_check", params);
    assert.equal(check.done_count, 1);
    assert.equal(check.completed, false);
    await assert.rejects(rpc(db, "btb_save_shift_check", params), { code: "40001" });
    assert.equal((await databaseRows(db, "btb_check_revisions")).find((row) => row.sheet_id === check.id).items[0].completed_by, member);
  });

  await t.test("training requires all sections, manager review, no self-approval and re-review after edits", async () => {
    const section = randomUUID();
    const topicParams = { p_id: null, p_revision: 0, p_title: "Safe opening", p_category: "food_safety", p_minutes: 5, p_published: true, p_video: "", p_sections: [{ id: section, position: 1, heading: "Wash hands", body: "Use soap." }], p_actor: "Manager" };
    const [topic] = await rpc(db, "btb_save_training_topic", topicParams);
    const recordParams = { p_employee_id: member, p_topic_id: topic.id, p_topic_revision: 1, p_version: 0, p_sections: [], p_reviewed: true, p_status: "pending", p_notes: "Ready" };
    await assert.rejects(rpc(db, "btb_save_training_record", recordParams), /Review every section/);
    const [record] = await rpc(db, "btb_save_training_record", { ...recordParams, p_sections: [section] });
    const review = { p_id: record.id, p_version: 1, p_decision: "approved", p_notes: "Demonstrated safely", p_reviewer: null, p_actor: "Manager (shared workspace)" };
    await assert.rejects(rpc(db, "btb_review_training", { ...review, p_reviewer: member }), /Cannot approve own/);
    const [approved] = await rpc(db, "btb_review_training", review);
    assert.equal(approved.status, "approved");
    assert.equal((await databaseRows(db, "btb_training_reviews")).length, 1);
    await assert.rejects(rpc(db, "btb_save_training_record", { ...recordParams, p_version: 2, p_sections: [section] }), { code: "40001" });
    await rpc(db, "btb_save_training_topic", { ...topicParams, p_id: topic.id, p_revision: 1 });
    const [resubmitted] = await rpc(db, "btb_save_training_record", { ...recordParams, p_version: 2, p_topic_revision: 2, p_sections: [section] });
    assert.equal(resubmitted.status, "pending");
    assert.equal(resubmitted.review_notes, null);
    await rpc(db, "btb_save_training_topic", { ...topicParams, p_id: topic.id, p_revision: 2 });
    await assert.rejects(rpc(db, "btb_review_training", { ...review, p_version: 3 }), { code: "40001" });
    assert.equal((await databaseRows(db, "btb_training_reviews")).length, 1);
  });

  await t.test("email claims deduplicate concurrent jobs, reject stale certificates and fence uncertain retries", async () => {
    await db.exec("UPDATE btb_notification_settings SET enabled=true,manager_emails=ARRAY['manager@example.test'],corporate_emails=ARRAY['hq@example.test']");
    const params = { p_source: "staff", p_document_id: licence, p_name: "Alice certificate", p_expiry: "2026-11-02", p_lead: 0, p_recipient: "manager@example.test" };
    const claims = await Promise.all([rpc(db, "btb_claim_licence_email", params), rpc(db, "btb_claim_licence_email", params)]);
    assert.equal(claims.flat().length, 1);
    const job = claims.flat()[0];
    assert.equal(job.attempts, 1);
    assert.equal(job.delivery_uncertain, true);
    await db.query("UPDATE btb_licence_email_log SET lease_until=now()-interval '1 minute' WHERE id=$1", [job.id]);
    const [retry] = await rpc(db, "btb_claim_licence_email", { ...params, p_name: "Renamed certificate" });
    assert.equal(retry.document_name, "Alice certificate");
    assert.equal(retry.id, job.id);
    assert.notEqual(retry.lease_token, job.lease_token);
    await db.query("UPDATE btb_licence_email_log SET lease_until=NULL,first_attempt_at=now()-interval '24 hours' WHERE id=$1", [job.id]);
    assert.deepEqual(await rpc(db, "btb_claim_licence_email", params), []);
    assert.deepEqual(await rpc(db, "btb_claim_licence_email", { ...params, p_recipient: "unauthorized@example.test" }), []);
    await db.query("UPDATE btb_staff_licences SET expiry_date='2027-11-02' WHERE id=$1", [licence]);
    assert.deepEqual(await rpc(db, "btb_claim_licence_email", { ...params, p_recipient: "hq@example.test" }), []);
    await db.exec("UPDATE btb_notification_settings SET enabled=false");
    assert.deepEqual(await rpc(db, "btb_claim_licence_email", { ...params, p_expiry: "2027-11-02", p_recipient: "hq@example.test" }), []);
  });
});
