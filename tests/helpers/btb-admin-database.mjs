import { readFileSync } from "node:fs";
import { createPlatformDatabase } from "./btb-platform-database.mjs";

const root = new URL("../../supabase/", import.meta.url);
export const adminMigrations = ["schema-btb-superadmin.sql", "schema-btb-invitations.sql"];
export const ADMIN_ID = "40000000-0000-4000-8000-000000000001";
export const PASSWORD_HASH = `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`;

export async function initializeAdminDatabase(db) {
  // The console must retain the current email release's closed-location rules.
  await db.exec(readFileSync(new URL("fix-btb-closed-site-jobs.sql", root), "utf8"));
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
