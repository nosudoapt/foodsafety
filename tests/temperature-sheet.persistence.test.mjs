import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";

const owner = "60000000-0000-4000-8000-000000000001";
const save = (db, cells, date = "2026-11-01") => db.query("SELECT * FROM btb_save_temperature_sheet($1,$2,$3,'Synthetic QA recorder')", [owner, date, JSON.stringify(cells)]);
test("HTTP-10 / HTTP-14: atomic sheet replay is unique, conflicts roll back the whole call, and mid-write failure rolls back audit too", async () => {
  const db = await createCoreDatabase();
  try {
    await db.query("INSERT INTO auth.users VALUES($1,'qa@test.invalid','{\"restaurant_name\":\"Between the Buns\"}')", [owner]);
    await db.exec(coreSql("fix-temperature-audit.sql"));
    await db.exec(coreSql("fix-temperature-server-time.sql"));
    await db.exec(coreSql("fix-temperature-verdict.sql"));
    await db.exec(coreSql("fix-temperature-sheet-atomic.sql"));
    await db.exec(coreSql("fix-temperature-sheet-atomic.sql"));
    const cells = [{ label: "COOLER-1", slot: "11:00", value: 2 }, { label: "SANTIZER", slot: "16:00", value: 250 }];
    const replies = await Promise.all(Array.from({ length: 12 }, () => save(db, cells)));
    assert.ok(replies.every(reply => reply.rows.length === 2));
    assert.equal((await db.query("SELECT count(*)::int n FROM temperature_records")).rows[0].n, 2);
    assert.equal(replies[0].rows[1].unit, "PPM");
    assert.equal(Number(replies[0].rows[1].min_safe_temp), 200);
    await asCoreRole(db, "service_role", null, async () => {
      assert.equal((await save(db, cells)).rows.length, 2);
    });
    await assert.rejects(save(db, [{ label: "FREEZER-1", slot: "11:00", value: -18 }, { label: "COOLER-1", slot: "11:00", value: 9 }]), /already saved differently/);
    assert.equal((await db.query("SELECT count(*)::int n FROM temperature_records")).rows[0].n, 2);
    await db.exec("CREATE FUNCTION qa_fail_sheet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.equipment_name='FREEZER-2' THEN RAISE EXCEPTION 'Synthetic mid-write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER qa_fail_sheet BEFORE INSERT ON temperature_records FOR EACH ROW EXECUTE FUNCTION qa_fail_sheet();");
    const events = (await db.query("SELECT count(*)::int n FROM temperature_record_events")).rows[0].n;
    await assert.rejects(save(db, [{ label: "FREEZER-1", slot: "11:00", value: -18 }, { label: "FREEZER-2", slot: "11:00", value: -18 }], "2026-11-02"), /Synthetic mid-write failure/);
    assert.equal((await db.query("SELECT count(*)::int n FROM temperature_records WHERE business_date='2026-11-02'")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int n FROM temperature_record_events")).rows[0].n, events);
    await db.exec("DROP TRIGGER qa_fail_sheet ON temperature_records;");
    await assert.rejects(save(db, [{ label: "COOLER-1", slot: "11:00", value: 2 }], "2099-01-01"), /future/);
    for (const role of ["anon", "authenticated"]) await assert.rejects(asCoreRole(db, role, owner, () => save(db, cells)), /permission denied/);
    await assert.rejects(db.query("INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe,business_date,slot) VALUES($1,'Between the Buns','COOLER-1','cold_storage','Dairy',2,0,4,true,'2026-11-01','11:00')", [owner]), /duplicate key/);
    // The SQL boundary must survive accidental browser grants/permissive RLS.
    await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON temperature_records TO anon,authenticated; CREATE POLICY qa_permissive ON temperature_records TO anon,authenticated USING(true) WITH CHECK(true)");
    for (const role of ["anon", "authenticated"]) {
      await asCoreRole(db, role, owner, async () => {
        assert.equal((await db.query("UPDATE temperature_records SET temperature=999 WHERE business_date IS NOT NULL RETURNING id")).rows.length, 0);
        assert.equal((await db.query("DELETE FROM temperature_records WHERE business_date IS NOT NULL RETURNING id")).rows.length, 0);
      });
    }
  } finally { await db.close(); }
});
