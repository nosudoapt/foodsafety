import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const schemaDirectory = new URL("../../supabase/", import.meta.url);
export const operationsSchema = readFileSync(new URL("schema-btb-team-operations.sql", schemaDirectory), "utf8");
export const uploadsSchema = readFileSync(new URL("schema-btb-uploads.sql", schemaDirectory), "utf8");
export const btbUploadTables = ["business_documents", "marketing_promotions", "social_media_calendar"];
export const btbDatabaseTables = [
  "btb_employees", "btb_employee_credentials", "btb_login_limits", "btb_shifts", "btb_shift_checks", "btb_check_revisions",
  "btb_order_sheets", "btb_order_revisions", "training_topics", "training_sections", "btb_training_records", "btb_training_reviews",
  "btb_franchise_tasks", "btb_staff_licences", "btb_notification_settings", "btb_licence_email_log",
];

export function identifier(value) {
  if (!/^[a-z_][a-z_0-9]*$/i.test(value)) throw new Error("Invalid database fixture identifier");
  return `"${value}"`;
}

// Use the actual legacy table declarations so imports run against their real
// columns, defaults and constraints. The small prelude supplies FK targets.
function declaration(file, table) {
  const source = readFileSync(new URL(file, schemaDirectory), "utf8");
  const match = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?^\\);`, "m"));
  if (!match) throw new Error(`Missing legacy table ${table}`);
  return match[0].replaceAll("uuid_generate_v4()", "gen_random_uuid()");
}

export async function insertRows(db, table, rows) {
  for (const row of rows) {
    const columns = Object.keys(row).map(identifier).join(",");
    await db.query(`INSERT INTO public.${identifier(table)} (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::public.${identifier(table)}, $1::jsonb)`, [JSON.stringify(row)]);
  }
}

export async function databaseRows(db, table) {
  const result = await db.query(`SELECT to_jsonb(value) AS row FROM public.${identifier(table)} value`);
  return result.rows.map((entry) => entry.row);
}

export async function createBtbDatabase(legacy = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY, restaurant_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT 'staff');
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_profile ON profiles FOR SELECT TO authenticated USING (id = auth.uid());
    GRANT SELECT ON profiles TO authenticated, service_role;
    CREATE TABLE locations(id uuid PRIMARY KEY);
    ${declaration("schema-staff-schedule.sql", "staff_members")}
    ${declaration("schema-staff-schedule.sql", "staff_shifts")}
    ${declaration("schema-checklists.sql", "btb_checklists")}
    ${declaration("schema-features.sql", "order_sheets")}
    ALTER TABLE order_sheets ADD COLUMN location_id uuid;
    ${declaration("schema-training.sql", "training_topics")}
    ${declaration("schema-training.sql", "training_sections")}
    ${declaration("schema-compliance.sql", "new_restaurant_tasks")}
    ${declaration("schema-rbac.sql", "staff_licenses")}
    ${declaration("schema-compliance.sql", "compliance_documents")}
    ALTER TABLE compliance_documents ADD COLUMN location_id uuid;
    ${readFileSync(new URL("schema-rbac.sql", schemaDirectory), "utf8").replaceAll("uuid_generate_v4()", "gen_random_uuid()")}
    ${readFileSync(new URL("schema-marketing-fields.sql", schemaDirectory), "utf8")}
    ${declaration("schema-tax-dates.sql", "corporate_dates")}
  `);
  for (const [table, rows] of Object.entries(legacy)) await insertRows(db, table, rows);
  try { await db.exec(operationsSchema); await db.exec(uploadsSchema); }
  catch (error) { await db.close(); throw error; }
  return db;
}

export async function rpc(db, name, parameters) {
  const keys = Object.keys(parameters);
  const args = keys.map((key, index) => `${identifier(key)} => $${index + 1}`).join(",");
  // PGlite encodes JS arrays as postgres arrays; JSONB parameters must be JSON.
  const values = Object.entries(parameters).map(([key, value]) => ["p_items", "p_lines", "p_sections"].includes(key) && Array.isArray(value) && (key !== "p_sections" || name === "btb_save_training_topic") ? JSON.stringify(value) : value);
  const result = await db.query(`SELECT to_jsonb(value) AS row FROM public.${identifier(name)}(${args}) value`, values);
  return result.rows.map((entry) => entry.row);
}
