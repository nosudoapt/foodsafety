import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";
const user="60000000-0000-4000-8000-000000000001";
const insert="INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe,recorded_at,created_at) VALUES($1,'Tenant A','Cooler','cold_storage','Dairy',9,0,4,false,'2000-01-01','2000-01-01') RETURNING *";
test("SEC-06: historical backdating reproduces; server INSERT time and browser correction timestamps cannot be forged",async()=>{
 const db=await createCoreDatabase();
 try{
  await db.query("INSERT INTO auth.users VALUES($1,'qa@test.invalid','{}')",[user]);
  const historical=(await db.query(insert,[user])).rows[0];
  assert.equal(new Date(historical.recorded_at).getUTCFullYear(),2000);
  await db.exec(coreSql("fix-temperature-server-time.sql"));
  await db.exec(coreSql("fix-temperature-server-time.sql"));
  for(const role of ["authenticated","service_role"]){
   const row=await asCoreRole(db,role,user,async()=>{
    const saved=(await db.query(insert,[user])).rows[0];
    assert.ok(Math.abs(Date.now()-new Date(saved.recorded_at).getTime())<10000);
    assert.equal(new Date(saved.created_at).getTime(),new Date(saved.recorded_at).getTime());
    if(role==='authenticated'){
     const changed=(await db.query("UPDATE temperature_records SET temperature=2,recorded_at='2000-01-01',created_at='2000-01-01' WHERE id=$1 RETURNING *",[saved.id])).rows[0];
     assert.equal(new Date(changed.recorded_at).getTime(),new Date(saved.recorded_at).getTime());
     assert.equal(new Date(changed.created_at).getTime(),new Date(saved.created_at).getTime());
    }
    return saved;
   });assert.ok(row.id);
  }
  assert.equal(new Date((await db.query("SELECT recorded_at FROM temperature_records WHERE id=$1",[historical.id])).rows[0].recorded_at).getUTCFullYear(),2000,"Migration must not invent a backfill");
 }finally{await db.close();}
});
