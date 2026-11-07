import { readFileSync, existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { createBtbDatabase } from "./btb-database.mjs";

const root = new URL("../../supabase/", import.meta.url);
export const platformMigrations = ["foundation", "operations", "inventory", "marketing", "automation", "api"];
export async function createPlatformDatabase(through = "api") {
  const db = await createBtbDatabase();
  await db.exec("ALTER TABLE locations ADD COLUMN name text NOT NULL DEFAULT 'Test location'; ALTER TABLE locations ADD COLUMN address text NOT NULL DEFAULT ''; ALTER TABLE locations ALTER COLUMN id SET DEFAULT gen_random_uuid(); GRANT ALL ON locations TO service_role;");
  const core = readFileSync(new URL("schema.sql", root), "utf8");
  for (const table of ["equipment", "temperature_records"]) {
    await db.exec(core.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?^\\);`, "m"))[0].replaceAll("uuid_generate_v4()", "gen_random_uuid()"));
  }
  await db.exec("ALTER TABLE temperature_records ADD COLUMN location_id uuid REFERENCES locations(id);");
  for (const file of ["schema-month-end-inventory.sql", "schema-inventory-summary.sql", "schema-inventory-purchases.sql", "schema-inventory-snapshots.sql", "schema-inventory-audit.sql"]) {
    await db.exec(readFileSync(new URL(file, root), "utf8").replaceAll("uuid_generate_v4()", "gen_random_uuid()"));
  }
  for (const name of platformMigrations) {
    const file = new URL(`schema-btb-platform-${name}.sql`, root);
    if (existsSync(file)) await db.exec(readFileSync(file, "utf8"));
    if (name === through) break;
  }
  return db;
}
export const IDS = {
  a: "10000000-0000-4000-8000-000000000001", b: "10000000-0000-4000-8000-000000000002",
  manager: "20000000-0000-4000-8000-000000000001", staff: "20000000-0000-4000-8000-000000000002",
  designer: "20000000-0000-4000-8000-000000000003", corporate: "20000000-0000-4000-8000-000000000004", owner: "20000000-0000-4000-8000-000000000005",
  uploader: "30000000-0000-4000-8000-000000000001",
};
export async function seedPlatform(db) {
  await db.query("INSERT INTO locations(id,name) VALUES($1,'Location A'),($2,'Location B')", [IDS.a, IDS.b]);
  await db.query("INSERT INTO btb_location_settings(location_id,timezone) VALUES($1,'America/Edmonton'),($2,'America/Regina')", [IDS.a, IDS.b]);
  await db.query("INSERT INTO profiles(id,restaurant_name) VALUES($1,'Between the Buns')", [IDS.uploader]);
  for (const role of ["manager", "staff", "designer", "corporate", "owner"]) {
    await db.query("INSERT INTO btb_employees(id,name,email,role,login_enabled) VALUES($1,$2,$3,$2,true)", [IDS[role], role, `${role}@test.invalid`]);
    await db.query("INSERT INTO btb_employee_credentials(employee_id,password_hash) VALUES($1,'test-hash')", [IDS[role]]);
  }
  await db.query("INSERT INTO btb_location_access(location_id,employee_id) VALUES($1,$2),($1,$3)", [IDS.a, IDS.manager, IDS.staff]);
}
export async function call(db, name, params) {
  const keys = Object.keys(params);
  const values = Object.values(params).map(v => v && typeof v === "object" ? JSON.stringify(v) : v);
  return (await db.query(`SELECT ${name}(${keys.map((k, i) => `${k} => $${i+1}`).join(",")}) AS result`, values)).rows[0]?.result;
}

export async function platformFile(db, purpose, actor=IDS.manager, location=IDS.a, content=randomUUID()) {
  const bytes=Buffer.from(content);
  return call(db,"btb_platform_file_put",{p_actor:actor,p_session:1,p_location:location,p_data:{id:randomUUID(),purpose,name:"fixture.pdf",mime:"application/pdf",byte_size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),content_base64:bytes.toString("base64")}});
}
export async function platformImport(db,kind,month="2026-11",location=IDS.a) {
  const file=await platformFile(db,kind==="sales"?"sales":"purchase",IDS.manager,location);
  return call(db,"btb_platform_import",{p_actor:IDS.manager,p_session:1,p_location:location,p_file:file.id,p_kind:kind,p_month:month,p_text:"TEST FIXTURE — NOT SOURCE DOCUMENT EVIDENCE",p_extracted:{},p_extractor:"test fixture",p_error:null});
}
