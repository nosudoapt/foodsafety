import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";

const user = "60000000-0000-4000-8000-000000000001";
const insert = "INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe) VALUES($1,'Tenant A','Cooler','cold_storage','Dairy',$2,0,4,$3) RETURNING *";
test("SEC-05: forged verdict reproduces historically; INSERT and UPDATE derive exact inclusive range in PostgreSQL", async () => {
  const db = await createCoreDatabase();
  try {
    await db.query("INSERT INTO auth.users VALUES($1,'qa@test.invalid','{}')", [user]);
    assert.equal((await db.query(insert, [user, 9, true])).rows[0].is_safe, true);
    await db.exec(coreSql("fix-temperature-audit.sql"));
    await db.exec(coreSql("fix-temperature-verdict.sql"));
    await db.exec(coreSql("fix-temperature-verdict.sql"));
    for (const role of ["authenticated", "service_role"]) {
      await asCoreRole(db, role, user, async () => {
        for (const value of [-0.01, 0, 3.99, 4, 4.01, 9]) {
          const saved = (await db.query(insert, [user, value, !(value >= 0 && value <= 4)])).rows[0];
          assert.equal(saved.is_safe, value >= 0 && value <= 4);
          const changed = (await db.query("UPDATE temperature_records SET temperature=9,is_safe=true WHERE id=$1 RETURNING *", [saved.id])).rows[0];
          assert.equal(changed.is_safe, false);
          const event = (await db.query("SELECT after_data FROM temperature_record_events WHERE record_id=$1 AND operation='UPDATE'", [saved.id])).rows[0];
          assert.equal(event.after_data.is_safe, false);
        }
      });
    }
    // Platform equipment can have no confirmed standards. Preserve its honest
    // unclassified state, even when a trusted caller submits a safe boolean.
    await db.exec("ALTER TABLE temperature_records ALTER COLUMN min_safe_temp DROP NOT NULL; ALTER TABLE temperature_records ALTER COLUMN max_safe_temp DROP NOT NULL; ALTER TABLE temperature_records ALTER COLUMN is_safe DROP NOT NULL;");
    const saved = (await db.query(insert, [user, 9, true])).rows[0];
    const ungraded = (await db.query("UPDATE temperature_records SET min_safe_temp=NULL,max_safe_temp=NULL,is_safe=true WHERE id=$1 RETURNING *", [saved.id])).rows[0];
    assert.equal(ungraded.is_safe, null);
    await assert.rejects(db.query("UPDATE temperature_records SET min_safe_temp=5,max_safe_temp=4 WHERE id=$1", [saved.id]), /Invalid temperature target range/);
  } finally { await db.close(); }
});
