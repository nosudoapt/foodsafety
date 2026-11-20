import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createBtbDatabase } from "./btb-database.mjs";
import { initializePlatformDatabase } from "./btb-platform-database.mjs";
import { initializeAdminDatabase } from "./btb-admin-database.mjs";

const root = new URL("../../supabase/", import.meta.url);
export const capabilitySql = file => readFileSync(new URL(file, root), "utf8").replaceAll("uuid_generate_v4()", "gen_random_uuid()");
export const btbCapabilityTables = [
  "compliance_documents", "business_documents", "staff_licenses", "inhouse_inspections", "corporate_inspections",
  "emergency_contacts", "operational_protocols", "handbook_documents", "print_manuals", "marketing_promotions",
  "social_media_calendar", "new_restaurant_tasks", "prep_counts", "order_sheets", "cleaning_logs", "cash_outs",
  "branding_requests", "corporate_dates", "handbook_signatures", "login_vault",
];

/** Real legacy declarations/policies, followed by the actual release SQL.
 * No application authorization is simulated by JavaScript. */
export async function initializeCapabilityDatabase(db) {
  for (const file of ["schema-compliance.sql", "schema-features.sql", "schema-inspection-consolidation.sql",
    "schema-emergency-contacts.sql", "schema-role-page-access.sql", "schema-cash-out.sql", "schema-branding-requests.sql",
    "schema-tax-dates.sql", "schema-tax-dates-attachments.sql", "schema-branding-attachments.sql", "schema-vault-categories.sql", "schema-platform-admin.sql", "schema-compliance-second-attachment.sql",
    "schema-november-13-updates.sql"]) await db.exec(capabilitySql(file));
  await db.exec("ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS done_time text; ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS week_start date; ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id); GRANT SELECT ON profiles TO anon;");
  await db.exec(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${[...btbCapabilityTables, "app_activity", "role_page_access"].join(",")} TO anon,authenticated,service_role`);
  await db.exec(capabilitySql("fix-btb-public-token-scope.sql"));
  await db.exec(capabilitySql("fix-btb-page-capabilities.sql"));
}

export async function createCapabilityDatabase() {
  const db = await createBtbDatabase({}, { temperatureStore: true });
  try {
    await initializePlatformDatabase(db);
    await initializeAdminDatabase(db);
    await initializeCapabilityDatabase(db);
    return db;
  } catch (error) { await db.close(); throw error; }
}

export async function capabilityToken(db, page, role = "manager", options = {}) {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await db.query(`INSERT INTO btb_public_tokens(token_hash,restaurant_name,expires_at,page,actor_role,employee_id,session_version,can_write)
    VALUES($1,$2,now()+interval '10 minutes',$3,$4,$5,$6,$7)`, [hash, options.restaurant ?? "Between the Buns", page, role, options.employee ?? null, options.session ?? null, options.write ?? false]);
  return token;
}

export async function asCapability(db, token, action, role = "anon", subject = "") {
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.headers',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ "x-btb-public-token": token }), subject]);
    return action(tx);
  });
}
