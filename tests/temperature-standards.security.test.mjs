import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";

test("HTTP-12: only trusted operators can provision temperature standards, even after browser grants/policies are restored", async () => {
  const db = await createCoreDatabase();
  try {
    await db.exec(coreSql("fix-btb-temperature-standards.sql"));
    await db.exec(coreSql("fix-btb-temperature-standards.sql"));
    assert.equal((await db.query("SELECT * FROM btb_temperature_standards")).rows.length, 0, "No guessed standard seeds");
    await asCoreRole(db, "service_role", null, async () => {
      await db.exec("INSERT INTO btb_temperature_standards(restaurant_name,record_type,equipment_name,min_safe_temp,max_safe_temp,approved_by) VALUES('Tenant A','cold_storage','Cooler',0,4,'Synthetic QA operator')");
      assert.equal((await db.query("SELECT max_safe_temp::float8 value FROM btb_temperature_standards")).rows[0].value, 4);
    });
    await db.exec("INSERT INTO btb_temperature_standards(restaurant_name,record_type,equipment_name,min_safe_temp,max_safe_temp,approved_by) VALUES('Tenant A','cold_storage','Cooler',0,4,'Synthetic QA operator'); GRANT ALL ON btb_temperature_standards TO anon,authenticated; CREATE POLICY historical_allow_all ON btb_temperature_standards TO anon,authenticated USING(true) WITH CHECK(true);");
    for (const role of ["anon", "authenticated"]) {
      await asCoreRole(db, role, null, async () => {
        assert.equal((await db.query("SELECT * FROM btb_temperature_standards")).rows.length, 0);
        assert.equal((await db.query("UPDATE btb_temperature_standards SET max_safe_temp=100 RETURNING *")).rows.length, 0);
        assert.equal((await db.query("DELETE FROM btb_temperature_standards RETURNING *")).rows.length, 0);
      });
      await assert.rejects(asCoreRole(db, role, null, () => db.exec("INSERT INTO btb_temperature_standards(restaurant_name,record_type,equipment_name,min_safe_temp,max_safe_temp,approved_by) VALUES('Tenant A','cold_storage','Forged',0,100,'Attacker')")), /row-level security/);
    }
  } finally { await db.close(); }
});
