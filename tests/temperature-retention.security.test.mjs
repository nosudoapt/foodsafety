import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, coreSql } from "./helpers/core-database.mjs";
const user="60000000-0000-4000-8000-000000000001";
const insert="INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe) VALUES($1,'Tenant A','Cooler','cold_storage','Dairy',9,0,4,false) RETURNING id";
test("SEC-08: historical account deletion erases readings; SET NULL retains evidence and original audit attribution",async()=>{
 const db=await createCoreDatabase();
 try{
  const provision=()=>db.query("INSERT INTO auth.users VALUES($1,'qa@test.invalid','{}')",[user]);
  await provision();await db.query(insert,[user]);await db.query("DELETE FROM auth.users WHERE id=$1",[user]);
  assert.equal((await db.query("SELECT * FROM temperature_records")).rows.length,0);
  await db.exec(coreSql("fix-temperature-audit.sql"));
  await db.exec(coreSql("fix-temperature-owner-retention.sql"));
  await db.exec(coreSql("fix-temperature-owner-retention.sql"));
  await provision();const id=(await db.query(insert,[user])).rows[0].id;
  await db.query("DELETE FROM auth.users WHERE id=$1",[user]);
  const record=(await db.query("SELECT * FROM temperature_records WHERE id=$1",[id])).rows[0];
  assert.equal(record.user_id,null);assert.equal(Number(record.temperature),9);assert.equal(record.restaurant_name,"Tenant A");
  const event=(await db.query("SELECT * FROM temperature_record_events WHERE record_id=$1 AND operation='INSERT'",[id])).rows[0];
  assert.equal(event.after_data.user_id,user);assert.equal(event.after_data.temperature,9);
 }finally{await db.close();}
});
