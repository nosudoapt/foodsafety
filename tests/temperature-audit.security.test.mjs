import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";
const user = "60000000-0000-4000-8000-000000000001";
const insert = "INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe) VALUES($1,'Tenant A','Cooler','cold_storage','Dairy',9,0,4,false) RETURNING id";

test("SEC-07: historical UPDATE has no audit; new committed UPDATE/DELETE preserve actor, time and exact before/after evidence", async () => {
  const db = await createCoreDatabase();
  try {
    await db.query("INSERT INTO auth.users VALUES($1,'qa@test.invalid','{}')", [user]);
    const id = (await db.query(insert, [user])).rows[0].id;
    assert.equal((await asCoreRole(db,"authenticated",user,()=>db.query("UPDATE temperature_records SET temperature=2,is_safe=true WHERE id=$1 RETURNING id",[id]))).rows.length,1);
    assert.equal((await db.query("SELECT to_regclass('public.temperature_record_events') AS audit")).rows[0].audit,null);
    await db.exec(coreSql("fix-temperature-audit.sql"));
    await db.exec(coreSql("fix-temperature-audit.sql"));
    await db.exec("BEGIN; SET LOCAL ROLE authenticated");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    await db.query("UPDATE temperature_records SET temperature=2,is_safe=true WHERE id=$1", [id]);
    await db.query("DELETE FROM temperature_records WHERE id=$1", [id]);
    await db.exec("COMMIT");
    const events=(await db.query("SELECT * FROM temperature_record_events ORDER BY created_at")).rows;
    assert.equal(events.length,2);
    assert.equal(events[0].operation,"UPDATE");assert.equal(events[0].before_data.temperature,9);assert.equal(events[0].after_data.temperature,2);
    assert.equal(events[1].operation,"DELETE");assert.equal(events[1].before_data.temperature,2);assert.equal(events[1].after_data,null);
    for(const event of events){assert.equal(event.record_id,id);assert.equal(event.actor_id,user);assert.equal(event.record_owner,user);assert.ok(event.created_at);}
    assert.equal((await db.query("SELECT * FROM temperature_records")).rows.length,0);
    // Even restored browser grants and a broad policy cannot alter evidence.
    await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON temperature_record_events TO authenticated; CREATE POLICY historical_all ON temperature_record_events FOR ALL TO authenticated USING(true) WITH CHECK(true)");
    await assert.rejects(asCoreRole(db,"authenticated",user,()=>db.query("DELETE FROM temperature_record_events")),/append-only/);
    await assert.rejects(asCoreRole(db,"authenticated",user,()=>db.query("UPDATE temperature_record_events SET after_data='{}'")),/append-only/);
    await assert.rejects(asCoreRole(db,"authenticated",user,()=>db.query("INSERT INTO temperature_record_events(record_id,restaurant_name,operation) VALUES($1,'Tenant A','DELETE')",[id])),/row-level security/);
  } finally { await db.close(); }
});
