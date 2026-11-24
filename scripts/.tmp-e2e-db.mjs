import { createCapabilityDatabase, capabilitySql } from "../tests/helpers/btb-capabilities-database.mjs";

const db = await createCapabilityDatabase();
const step = async (label, sql) => {
  try { await db.exec(sql); console.log("ok  ", label); return true; }
  catch (error) { console.log("FAIL", label, "→", error.code ?? "", String(error.message).slice(0, 120)); return false; }
};

await step("authenticator", "CREATE ROLE authenticator NOINHERIT");
await step("auth shim", `CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, encrypted_password text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb, deleted_at timestamptz, banned_until timestamptz);`);

// The subset the cutover SQL touches.
for (const file of ["schema-locations.sql", "schema-roles.sql", "schema-btb-team-operations.sql", "schema-btb-superadmin.sql"]) {
  if (!await step(file, capabilitySql(file))) break;
}
for (const file of ["schema-workspace-auth-cutover.sql", "schema-workspace-session-scope.sql", "schema-btb-console-locations-fix.sql"]) {
  if (!await step(file, capabilitySql(file))) break;
}
await db.close();
