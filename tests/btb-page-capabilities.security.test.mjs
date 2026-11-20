import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createCapabilityDatabase, capabilitySql, capabilityToken, asCapability, btbCapabilityTables } from "./helpers/btb-capabilities-database.mjs";
import { IDS, seedPlatform, call } from "./helpers/btb-platform-database.mjs";
import { ADMIN_ID, PASSWORD_HASH, seedAdmin } from "./helpers/btb-admin-database.mjs";

const require = createRequire(import.meta.url);
const { BTB_CARDS } = require("../.test-dist/src/lib/btb-hub.js");
const { BTB_MATRIX } = require("../.test-dist/src/lib/btb-access.js");
const { BTB_ROLES } = require("../.test-dist/src/lib/btb-roles.js");
const hash = token => createHash("sha256").update(token).digest("hex");

test("live BTB page capabilities enforce the real role/grant ceiling, RLS and atomic RPCs", async t => {
  const db = await createCapabilityDatabase();
  try {
    await seedPlatform(db);
    await db.exec("INSERT INTO profiles(id,restaurant_name,role) VALUES('50000000-0000-4000-8000-000000000001','FoodSafe tenant','owner'); INSERT INTO locations(id,name) VALUES('50000000-0000-4000-8000-000000000002','FoodSafe site')");

    await t.test("the SQL static matrix matches every page and role and reapplying preserves data", async () => {
      const permissions = (await db.query("SELECT * FROM btb_page_permissions ORDER BY page")).rows;
      assert.equal(permissions.length, BTB_CARDS.length);
      for (const card of BTB_CARDS) {
        const permission = permissions.find(row => row.page === card.href.slice("/btb/demo/".length));
        assert.deepEqual([...permission.view_roles].sort(), [...BTB_MATRIX[card.feature].view].sort(), card.href);
        assert.deepEqual([...permission.edit_roles].sort(), [...BTB_MATRIX[card.feature].edit].sort(), card.href);
        for (const role of BTB_ROLES) for (const write of [false, true]) {
          const expected = BTB_MATRIX[card.feature].view.includes(role) && (!write || BTB_MATRIX[card.feature].edit.includes(role));
          assert.equal((await db.query("SELECT btb_effective_page_allowed($1,NULL,$2,$3) AS allowed", [role, permission.page, write])).rows[0].allowed, expected, `${role} ${permission.page} ${write}`);
        }
      }
      const token = await capabilityToken(db, "emergency");
      await db.exec(capabilitySql("fix-btb-page-capabilities.sql"));
      assert.equal((await asCapability(db, token, tx => tx.query("SELECT btb_public_page('emergency') AS allowed"))).rows[0].allowed, true);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM btb_employees")).rows[0].n, 5);
    });

    await t.test("read tokens cannot mutate, cross-page tokens never read and old/unverified tokens fail closed", async () => {
      await db.exec("INSERT INTO emergency_contacts(restaurant_name,name,phone) VALUES('Between the Buns','BTB contact','123'),('FoodSafe tenant','Other contact','456')");
      const read = await capabilityToken(db, "emergency", "staff");
      const write = await capabilityToken(db, "emergency", "manager", { write: true });
      const wrong = await capabilityToken(db, "prep-list", "manager", { write: true });
      const old = await capabilityToken(db, null);
      const forgedRole = await capabilityToken(db, "emergency", "staff", { write: true });
      const expired = await capabilityToken(db, "emergency");
      await db.query("UPDATE btb_public_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [hash(expired)]);
      for (const token of [undefined, "bad", "0".repeat(64), old, wrong, expired]) assert.equal((await asCapability(db, token, tx => tx.query("SELECT * FROM emergency_contacts"))).rows.length, 0);
      assert.equal((await asCapability(db, read, tx => tx.query("SELECT * FROM emergency_contacts"))).rows.length, 1);
      for (const token of [read, forgedRole]) {
        assert.equal((await asCapability(db, token, tx => tx.query("UPDATE emergency_contacts SET name='forged' RETURNING id"))).rows.length, 0);
        assert.equal((await asCapability(db, token, tx => tx.query("DELETE FROM emergency_contacts RETURNING id"))).rows.length, 0);
        await assert.rejects(asCapability(db, token, tx => tx.query("INSERT INTO emergency_contacts(name,phone) VALUES('forged','123')")), /row-level security/);
      }
      assert.equal((await asCapability(db, write, tx => tx.query("UPDATE emergency_contacts SET name='saved' RETURNING id"))).rows.length, 1);
      await assert.rejects(asCapability(db, write, tx => tx.query("UPDATE emergency_contacts SET restaurant_name='FoodSafe tenant'")), /row-level security/);
      for (const table of ["btb_public_tokens", "btb_page_permissions", "role_page_access", "btb_location_settings"]) await assert.rejects(asCapability(db, write, tx => tx.query(`SELECT * FROM ${table}`)), /permission denied/);
      // Reintroducing ALL of the old permissive policies cannot reopen a page,
      // a read-only mode or another restaurant.
      await db.exec(capabilitySql("schema-btb-public.sql"));
      assert.equal((await asCapability(db, wrong, tx => tx.query("SELECT * FROM emergency_contacts"))).rows.length, 0);
      assert.equal((await asCapability(db, read, tx => tx.query("DELETE FROM emergency_contacts RETURNING id"))).rows.length, 0);
      await db.exec(capabilitySql("fix-btb-page-capabilities.sql"));
    });

    await t.test("saved restrictions, location union, closure, removal, block and credential rotation revoke issued tokens", async () => {
      const legacy = await capabilityToken(db, "emergency", "manager", { employee: IDS.manager, session: 1, write: true });
      const allowed = token => asCapability(db, token, tx => tx.query("SELECT btb_public_page('emergency',true) AS allowed")).then(result => result.rows[0].allowed);
      assert.equal(await allowed(legacy), false, "assigned locations default denied");
      await db.query("INSERT INTO btb_location_page_access(location_id,page,allowed) VALUES($1,'emergency',true)", [IDS.a]);
      assert.equal(await allowed(legacy), true);
      await db.exec("INSERT INTO role_page_access(role,page,allowed) VALUES('manager','emergency',false)");
      assert.equal(await allowed(legacy), false);
      await db.exec("DELETE FROM role_page_access");
      await db.query("INSERT INTO btb_location_access(location_id,employee_id) VALUES($1,$2)", [IDS.b, IDS.manager]);
      await db.query("INSERT INTO btb_location_page_access(location_id,page,allowed) VALUES($1,'emergency',true)", [IDS.b]);
      await db.query("UPDATE btb_location_settings SET active=false WHERE location_id=$1", [IDS.a]);
      assert.equal(await allowed(legacy), true, "the second active location grants the page");
      await db.query("UPDATE btb_location_settings SET active=false WHERE location_id=$1", [IDS.b]);
      assert.equal(await allowed(legacy), false);
      await db.exec("UPDATE btb_location_settings SET active=true");
      await db.query("UPDATE btb_employee_credentials SET session_version=2 WHERE employee_id=$1", [IDS.manager]);
      assert.equal(await allowed(legacy), false);
      const renewed = await capabilityToken(db, "emergency", "manager", { employee: IDS.manager, session: 2, write: true });
      assert.equal(await allowed(renewed), true);
      await db.query("UPDATE btb_employees SET active=false WHERE id=$1", [IDS.manager]);
      assert.equal(await allowed(renewed), false);
      await db.query("UPDATE btb_employees SET active=true WHERE id=$1", [IDS.manager]);
      await db.query("UPDATE btb_public_tokens SET revoked_at=now() WHERE token_hash=$1", [hash(renewed)]);
      assert.equal(await allowed(renewed), false);
      await db.query("UPDATE btb_employee_credentials SET session_version=1 WHERE employee_id=$1", [IDS.manager]);
      await db.query("DELETE FROM btb_location_access WHERE employee_id=$1 AND location_id=$2", [IDS.manager, IDS.b]);
      await db.query("DELETE FROM btb_location_page_access WHERE location_id=$1", [IDS.b]);
    });

    await t.test("location grants do not reopen legacy operational tables and the platform rechecks its page", async () => {
      await db.query("INSERT INTO btb_location_page_access(location_id,page,allowed) VALUES($1,'prep-list',true),($1,'platform',true)", [IDS.a]);
      const ops = await capabilityToken(db, "prep-list", "manager", { employee: IDS.manager, session: 1, write: true });
      assert.equal((await asCapability(db, ops, tx => tx.query("SELECT btb_public_page('prep-list',true) AS allowed"))).rows[0].allowed, false);
      assert.equal((await call(db, "btb_platform_bootstrap", { p_actor: IDS.manager, p_session: 1 })).locations.length, 1);
      await db.query("UPDATE btb_location_page_access SET allowed=false WHERE location_id=$1 AND page='platform'", [IDS.a]);
      await assert.rejects(call(db, "btb_platform_bootstrap", { p_actor: IDS.manager, p_session: 1 }), error => error.code === "42501");
      await db.exec("DELETE FROM btb_location_page_access WHERE page IN ('platform','prep-list')");
    });

    await t.test("removed console people retain history but can never regain unassigned legacy access", async () => {
      await seedAdmin(db);
      await db.query("INSERT INTO btb_superadmin_locations(location_id) VALUES($1) ON CONFLICT DO NOTHING", [IDS.a]);
      const invited = await call(db, "btb_admin_add_person", {
        p_actor: ADMIN_ID, p_session: 1, p_location: IDS.a,
        p_data: { name: "Removed Manager", email: "removed-manager@test.invalid", role: "manager" },
        p_token_hash: hash("removed-manager-invite"), p_subject: "Invitation", p_body: "Password setup link",
      });
      await call(db, "btb_invitation_consume", { p_token_hash: hash("removed-manager-invite"), p_password_hash: PASSWORD_HASH });
      const issued = await capabilityToken(db, "emergency", "manager", { employee: invited.employee_id, session: 1, write: true });
      const allowed = token => asCapability(db, token, tx => tx.query("SELECT btb_public_page('emergency',true) AS allowed")).then(result => result.rows[0].allowed);
      assert.equal(await allowed(issued), true);
      await call(db, "btb_admin_remove_person", { p_actor: ADMIN_ID, p_session: 1, p_location: IDS.a, p_employee: invited.employee_id });
      assert.equal(await allowed(issued), false);
      assert.deepEqual(await call(db, "btb_employee_page_grants", { p_employee: invited.employee_id }), { locationIds: [], pageGrants: [] });
      assert.equal((await db.query("SELECT count(*)::int AS n FROM btb_invitations WHERE employee_id=$1", [invited.employee_id])).rows[0].n, 1);
      assert.ok((await db.query("SELECT count(*)::int AS n FROM btb_events WHERE entity_id=$1", [invited.employee_id])).rows[0].n >= 2);
      // Even an accidental legacy reactivation cannot erase the invitation
      // history and turn the removed person into an unassigned tablet manager.
      await db.query("UPDATE btb_employees SET active=true,login_enabled=true WHERE id=$1", [invited.employee_id]);
      const renewed = await capabilityToken(db, "emergency", "manager", { employee: invited.employee_id, session: 2, write: true });
      assert.equal(await allowed(renewed), false);
      assert.equal((await db.query("SELECT btb_effective_page_allowed('manager',$1,'prep-list',true) AS allowed", [invited.employee_id])).rows[0].allowed, false);
    });

    await t.test("omitted location-only cash, branding and tax rows are BTB scoped and inspection types require their exact page", async () => {
      const otherSite = "50000000-0000-4000-8000-000000000002";
      for (const [table, extra] of [["cash_outs", ""], ["branding_requests", ",title"], ["corporate_dates", ",title,category,due_date,recurrence"]]) {
        for (const location of [null, IDS.a, otherSite]) {
          const fields = extra === "" ? "" : table === "branding_requests" ? ",'fixture'" : ",'fixture','other',CURRENT_DATE,'none'";
          await db.query(`INSERT INTO ${table}(location_id${extra}) VALUES($1${fields})`, [location]);
        }
      }
      for (const [table, page] of [["cash_outs", "cash-out"], ["branding_requests", "branding-requests"], ["corporate_dates", "tax-dates"]]) {
        const read = await capabilityToken(db, page, "staff");
        const write = await capabilityToken(db, page, "manager", { write: true });
        assert.equal((await asCapability(db, write, tx => tx.query(`SELECT * FROM ${table}`))).rows.length, 2, table);
        assert.equal((await asCapability(db, read, tx => tx.query(`DELETE FROM ${table} RETURNING id`))).rows.length, 0);
        await assert.rejects(asCapability(db, write, tx => tx.query(`UPDATE ${table} SET location_id=$1`, [otherSite])), /row-level security/);
      }
      await db.query("INSERT INTO corporate_inspections(user_id,restaurant_name,inspection_date,inspector_name,inspector_role,inspection_type) SELECT $1,'Between the Buns',CURRENT_DATE,'QA','QA',type FROM unnest(ARRAY['in-house','corporate','franchisee']) type", [IDS.uploader]);
      const local = await capabilityToken(db, "inspections", "corporate", { write: true });
      const franchise = await capabilityToken(db, "franchise-inspection", "corporate", { write: true });
      assert.deepEqual((await asCapability(db, local, tx => tx.query("SELECT inspection_type FROM corporate_inspections"))).rows.map(row => row.inspection_type), ["in-house"]);
      assert.equal((await asCapability(db, franchise, tx => tx.query("SELECT * FROM corporate_inspections"))).rows.length, 2);
      await assert.rejects(asCapability(db, local, tx => tx.query("UPDATE corporate_inspections SET inspection_type='franchisee'")), /row-level security/);
    });

    await t.test("vault and signatures are never raw public capabilities and FoodSafe retains its own authenticated records", async () => {
      await db.exec("INSERT INTO login_vault(restaurant_name,service,secret) VALUES('Between the Buns','BTB','ciphertext'),('FoodSafe tenant','FS','ciphertext'); INSERT INTO handbook_documents(restaurant_name,title) VALUES('Between the Buns','book'); INSERT INTO handbook_signatures(handbook_id,staff_name,signature) SELECT id,'QA','QA' FROM handbook_documents");
      const vault = await capabilityToken(db, "vault", "manager", { write: true });
      const handbook = await capabilityToken(db, "handbook", "manager", { write: true });
      assert.equal((await asCapability(db, vault, tx => tx.query("SELECT * FROM login_vault"))).rows.length, 0);
      assert.equal((await asCapability(db, handbook, tx => tx.query("SELECT * FROM handbook_signatures"))).rows.length, 0);
      const owner = "50000000-0000-4000-8000-000000000001";
      assert.deepEqual((await asCapability(db, vault, tx => tx.query("SELECT service FROM login_vault"), "authenticated", owner)).rows.map(row => row.service), ["FS"]);
      assert.equal((await asCapability(db, handbook, tx => tx.query("SELECT * FROM handbook_signatures"), "authenticated", owner)).rows.length, 0);
      // Exercise every protected table under a simultaneous FoodSafe identity.
      for (const table of btbCapabilityTables.filter(table => !["handbook_signatures", "cash_outs", "branding_requests", "corporate_dates"].includes(table))) {
        assert.equal((await asCapability(db, handbook, tx => tx.query(`SELECT * FROM ${table} WHERE restaurant_name='Between the Buns'`), "authenticated", owner)).rows.length, 0, table);
      }
    });

    await t.test("prep replay checks live write access before receipts and binds personal actors without a FoodSafe identity", async () => {
      const token = await capabilityToken(db, "prep-list", "manager", { write: true });
      const read = await capabilityToken(db, "prep-list", "staff");
      const wrong = await capabilityToken(db, "emergency", "manager", { write: true });
      const row = { item_name: "Atomic prep", par: 4, on_hand: 1, pull: 0, urgent: false, location_id: null };
      const args = ["2026-11-19", null, JSON.stringify([row]), "b".repeat(64)];
      const replay = (tx, values = args) => tx.query("SELECT btb_replay_prep_save($1,$2,$3::jsonb,$4) AS affected", values);
      for (const capability of [undefined, read, wrong]) await assert.rejects(asCapability(db, capability, replay), error => error.code === "42501");
      assert.equal((await asCapability(db, token, replay)).rows[0].affected, 1);
      assert.equal((await asCapability(db, token, replay)).rows[0].affected, 1);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM btb_offline_receipts WHERE replay_key=$1", [args[3]])).rows[0].n, 1);
      const before = (await db.query("SELECT * FROM prep_counts WHERE count_date=$1 ORDER BY id", [args[0]])).rows;
      await db.exec("CREATE FUNCTION test_prep_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.item_name='force-rollback' THEN RAISE EXCEPTION 'Injected insertion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_prep_rollback BEFORE INSERT ON prep_counts FOR EACH ROW EXECUTE FUNCTION test_prep_rollback();");
      const failedKey = "d".repeat(64);
      await assert.rejects(asCapability(db, token, tx => replay(tx, [args[0], null, JSON.stringify([row, { ...row, item_name: "force-rollback" }]), failedKey])), /Injected insertion failure/);
      assert.deepEqual((await db.query("SELECT * FROM prep_counts WHERE count_date=$1 ORDER BY id", [args[0]])).rows, before, "a failed insertion restores the deleted sheet");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM btb_offline_receipts WHERE replay_key=$1", [failedKey])).rows[0].n, 0);
      await db.exec("DROP TRIGGER test_prep_rollback ON prep_counts; DROP FUNCTION test_prep_rollback();");
      await assert.rejects(asCapability(db, token, tx => replay(tx, [args[0], null, JSON.stringify([{ ...row, on_hand: 2 }]), args[3]])), error => error.code === "22023");
      await assert.rejects(asCapability(db, token, tx => tx.query("SELECT btb_replay_prep_save_atomic($1,$2,$3::jsonb,$4)", args)), /permission denied/);
      await db.exec("INSERT INTO role_page_access(role,page,allowed) VALUES('manager','prep-list',false)");
      await assert.rejects(asCapability(db, token, replay), error => error.code === "42501");
      await db.exec("DELETE FROM role_page_access");
      // Corporate personal accounts preserve their legacy oversight exception;
      // a store manager has to be truly unassigned to use the old prep tablet.
      await db.query("DELETE FROM btb_location_access WHERE employee_id=$1", [IDS.manager]);
      const personal = await capabilityToken(db, "prep-list", "manager", { employee: IDS.manager, session: 1, write: true });
      const personalArgs = [...args.slice(0, 3), "c".repeat(64)];
      await asCapability(db, personal, tx => replay(tx, personalArgs), "authenticated", "50000000-0000-4000-8000-000000000001");
      assert.equal((await db.query("SELECT actor::text FROM btb_offline_receipts WHERE replay_key=$1", [personalArgs[3]])).rows[0].actor, IDS.manager);
      await assert.rejects(asCapability(db, token, tx => replay(tx, personalArgs)), error => error.code === "42501");
    });
  } finally { await db.close(); }
});
