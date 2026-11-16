import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const coreSql = (name) => readFileSync(new URL(`../../supabase/${name}`, import.meta.url), "utf8")
  .replaceAll("uuid_generate_v4()", "gen_random_uuid()")
  .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', "");

export async function createCoreDatabase(migrations = []) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
  `);
  for (const name of ["schema.sql", "schema-roles.sql", "fix-rls.sql"]) await db.exec(coreSql(name));
  await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;");
  for (const name of migrations) await db.exec(coreSql(name));
  return db;
}

export async function asCoreRole(db, role, id, action) {
  if (!["anon", "authenticated", "service_role"].includes(role)) throw new Error("Unknown fixture role");
  await db.exec("BEGIN");
  try {
    await db.exec(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id ?? ""]);
    return await action();
  } finally { await db.exec("ROLLBACK"); }
}
