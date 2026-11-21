import { readFileSync } from "node:fs";
import { createPlatformDatabase } from "./btb-platform-database.mjs";
import { declaration } from "./btb-database.mjs";

const root = new URL("../../supabase/", import.meta.url);
// Step 35 order does not matter relative to step 34: they replace disjoint
// functions (page capabilities vs monitoring/storage cap).
export const adminMigrations = ["schema-btb-superadmin.sql", "schema-btb-invitations.sql", "schema-btb-admin-monitoring.sql"];
export const ADMIN_ID = "40000000-0000-4000-8000-000000000001";
export const PASSWORD_HASH = `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`;

export async function initializeAdminDatabase(db) {
  // The console must retain the current email release's closed-location rules.
  await db.exec(readFileSync(new URL("fix-btb-closed-site-jobs.sql", root), "utf8"));
  // Step 35 monitors app_activity, installed by the platform dashboard release
  // in production and by the capability fixtures; this installer adds the same
  // real declaration so the console database matches.
  await db.exec(`${declaration("schema-platform-admin.sql", "app_activity")}
    CREATE INDEX IF NOT EXISTS idx_app_activity_created ON app_activity(created_at DESC);
    ALTER TABLE app_activity ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON app_activity TO service_role;`);
  for (const file of adminMigrations) await db.exec(readFileSync(new URL(file, root), "utf8"));
}

export async function createAdminDatabase() {
  const db = await createPlatformDatabase();
  try { await initializeAdminDatabase(db); return db; }
  catch (error) { await db.close(); throw error; }
}

export async function seedAdmin(db) {
  await db.query("INSERT INTO btb_super_admins(id,email,name,password_hash) VALUES($1,'console@test.invalid','Console Admin',$2)", [ADMIN_ID, PASSWORD_HASH]);
}
