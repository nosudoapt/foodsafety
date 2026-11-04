import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("the existing temperature schema keeps BTB's genuine profile ownership isolated from FoodSafe and anonymous clients", async () => {
  const db = new PGlite();
  const source = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const declaration = source.match(/CREATE TABLE IF NOT EXISTS temperature_records \([\s\S]*?^\);/m)?.[0];
  const policies = source.split("\n").filter((line) => line.startsWith("CREATE POLICY") && line.includes("ON temperature_records"));
  assert.ok(declaration);
  assert.equal(policies.length, 4);
  const owner = "10000000-0000-4000-8000-000000000098";
  const foodSafe = "10000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      INSERT INTO profiles VALUES ('${owner}'), ('${foodSafe}');
      ${declaration.replaceAll("uuid_generate_v4()", "gen_random_uuid()")}
      ALTER TABLE temperature_records ENABLE ROW LEVEL SECURITY;
      ${policies.join("\n")}
      GRANT SELECT, INSERT, UPDATE, DELETE ON temperature_records TO anon, authenticated, service_role;
      INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe)
        VALUES ('${owner}','Between the Buns','Fridge','cold_storage','Dairy',3,0,4,true),
               ('${foodSafe}','The Test Kitchen','Fridge','cold_storage','Dairy',3,0,4,true);`);
    const visible = async (role, subject) => db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role}`);
      if (subject) await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [subject]);
      return (await tx.query("SELECT restaurant_name FROM temperature_records")).rows;
    });
    assert.deepEqual(await visible("anon"), []);
    assert.deepEqual(await visible("authenticated", foodSafe), [{ restaurant_name: "The Test Kitchen" }]);
    assert.equal((await visible("service_role")).length, 2);
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE authenticated");
      await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [foodSafe]);
      await tx.query("INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe) VALUES ($1,'Between the Buns','Fridge','cold_storage','Dairy',3,0,4,true)", [owner]);
    }), { code: "42501" });
    await assert.rejects(db.query("INSERT INTO temperature_records(user_id,restaurant_name,equipment_name,record_type,food_item,temperature,min_safe_temp,max_safe_temp,is_safe) VALUES ('10000000-0000-4000-8000-000000000097','Between the Buns','Fridge','cold_storage','Dairy',3,0,4,true)"), { code: "23503" });
  } finally { await db.close(); }
});
