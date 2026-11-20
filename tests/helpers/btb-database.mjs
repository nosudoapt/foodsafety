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
  "platform_auth",
  "btb_temperature_standards", "btb_offline_receipts",
];

export function identifier(value) {
  if (!/^[a-z_][a-z_0-9]*$/i.test(value)) throw new Error("Invalid database fixture identifier");
  return `"${value}"`;
}

// Use the actual legacy table declarations so imports run against their real
// columns, defaults and constraints. The small prelude supplies FK targets.
export function declaration(file, table) {
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

export async function createBtbDatabase(legacy = {}, options = {}) {
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
    ${declaration("schema-features.sql", "prep_counts")}
    ALTER TABLE prep_counts ADD COLUMN location_id uuid;
    ALTER TABLE prep_counts ADD COLUMN pull numeric NOT NULL DEFAULT 0;
    ALTER TABLE prep_counts ADD COLUMN urgent boolean NOT NULL DEFAULT false;
    ${declaration("schema-training.sql", "training_topics")}
    ${declaration("schema-training.sql", "training_sections")}
    ${declaration("schema-compliance.sql", "new_restaurant_tasks")}
    ${declaration("schema-rbac.sql", "staff_licenses")}
    ${declaration("schema-compliance.sql", "compliance_documents")}
    ALTER TABLE compliance_documents ADD COLUMN location_id uuid;
    ALTER TABLE compliance_documents ADD COLUMN notify boolean DEFAULT true;
    ALTER TABLE compliance_documents ADD COLUMN notify_days integer;
    ${readFileSync(new URL("schema-rbac.sql", schemaDirectory), "utf8").replaceAll("uuid_generate_v4()", "gen_random_uuid()")}
    ${readFileSync(new URL("schema-marketing-fields.sql", schemaDirectory), "utf8")}
    ${declaration("schema-tax-dates.sql", "corporate_dates")}
    -- Supabase grants this to the API roles by default; the local PGlite prelude
    -- does not, and the service-role reminder claim reads the shared calendar.
    GRANT ALL ON corporate_dates TO service_role;
    ${declaration("schema-platform-admin.sql", "platform_auth")}
    -- The offline receipt ledger is part of the baseline operations schema; the
    -- replay functions below need it even when temperature capture is absent.
    CREATE TABLE IF NOT EXISTS public.btb_offline_receipts (
      replay_key text PRIMARY KEY CHECK (replay_key ~ '^[0-9a-f]{64}$'),
      kind text NOT NULL CHECK (kind IN ('temp_record','prep_save')),
      actor uuid, args jsonb NOT NULL, result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    ALTER TABLE public.btb_offline_receipts ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.btb_offline_receipts FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.btb_offline_receipts TO service_role;
  `);
  for (const [table, rows] of Object.entries(legacy)) await insertRows(db, table, rows);
  // Release 07 (schema-btb-platform-operations.sql) scopes shift checks with
  // location_id; the API filters .is("location_id", null).
  try { await db.exec(operationsSchema); await db.exec(uploadsSchema);
    // Release 07 / platform marketing scope rows with location_id; the BTB API
    // filters .is("location_id", null) on both tables.
    await db.exec("ALTER TABLE btb_shift_checks ADD COLUMN location_id uuid; ALTER TABLE social_media_calendar ADD COLUMN location_id uuid;");
    await db.exec(readFileSync(new URL("fix-platform-bootstrap-security.sql", schemaDirectory), "utf8"));
    await db.exec(readFileSync(new URL("fix-btb-temperature-standards.sql", schemaDirectory), "utf8"));
    if (options.temperatureStore) {
      await db.exec(declaration("schema.sql", "equipment"));
      await db.exec(declaration("schema.sql", "temperature_records"));
      await db.exec("ALTER TABLE temperature_records ADD COLUMN location_id uuid REFERENCES locations(id); ALTER TABLE temperature_records ADD COLUMN equipment_id uuid REFERENCES equipment(id); ALTER TABLE temperature_records ADD COLUMN recorded_by uuid REFERENCES btb_employees(id);");
      const core = readFileSync(new URL("schema.sql", schemaDirectory), "utf8");
      for (const policy of core.matchAll(/^CREATE POLICY .* ON temperature_records .*;$/gm)) await db.exec(policy[0]);
      await db.exec("ALTER TABLE temperature_records ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON temperature_records TO authenticated,service_role;");
      for (const file of ["fix-temperature-audit.sql", "fix-temperature-server-time.sql", "fix-temperature-owner-retention.sql", "fix-temperature-verdict.sql", "fix-temperature-sheet-atomic.sql", "fix-offline-replay-keys.sql", "fix-temperature-team-read.sql"]) {
        await db.exec(readFileSync(new URL(file, schemaDirectory), "utf8"));
      }
      // The ledger is server-only; the service role still needs to inspect it.
      await db.exec("GRANT SELECT ON public.btb_offline_receipts TO service_role;");
    }
  }
  catch (error) { await db.close(); throw error; }
  return db;
}

export async function rpc(db, name, parameters) {
  const keys = Object.keys(parameters);
  const args = keys.map((key, index) => `${identifier(key)} => $${index + 1}`).join(",");
  // Keep uuid[] training progress as a PostgreSQL array, but serialize JSONB
  // command objects and arrays exactly as PostgREST does.
  const jsonKeys = ["p_items", "p_lines", "p_sections", "p_cells", "p_changes", "p_data", "p_extracted", "p_rows"];
  const values = Object.entries(parameters).map(([key, value]) => jsonKeys.includes(key) && value !== null && typeof value === "object" && (key !== "p_sections" || name === "btb_save_training_topic") ? JSON.stringify(value) : value);
  const result = await db.query(`SELECT to_jsonb(value) AS row FROM public.${identifier(name)}(${args}) value`, values);
  return result.rows.map((entry) => entry.row);
}
