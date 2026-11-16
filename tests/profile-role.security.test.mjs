import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";

const id = "50000000-0000-4000-8000-000000000001";
const roles = ["staff", "manager", "owner", "multi_location_owner", "corporate", "designer"];

test("SEC-01: historical policy reproduces self-promotion; the migration blocks every browser role", async () => {
  const db = await createCoreDatabase();
  try {
    await db.query("INSERT INTO auth.users VALUES ($1, 'qa@test.invalid', '{\"role\":\"staff\"}')", [id]);
    const before = await asCoreRole(db, "authenticated", id, () => db.query("UPDATE profiles SET role='corporate' WHERE id=$1 RETURNING role", [id]));
    assert.equal(before.rows[0].role, "corporate");
    await db.exec(coreSql("fix-rls-profile-role.sql"));
    // Re-applying ordinary Supabase table grants cannot bypass the guard.
    await db.exec("GRANT UPDATE ON profiles TO authenticated");
    for (const role of roles) {
      await db.query("UPDATE profiles SET role=$1 WHERE id=$2", [role, id]);
      await assert.rejects(asCoreRole(db, "authenticated", id, () => db.query("UPDATE profiles SET role=$1 WHERE id=$2", [role === "corporate" ? "owner" : "corporate", id])), /require an administrator/);
      const renamed = await asCoreRole(db, "authenticated", id, () => db.query("UPDATE profiles SET full_name='QA renamed' WHERE id=$1 RETURNING full_name", [id]));
      assert.equal(renamed.rows[0].full_name, "QA renamed");
    }
    await assert.rejects(asCoreRole(db, "authenticated", id, () => db.query("UPDATE profiles SET trial_ends_at=now()+interval '1 year' WHERE id=$1", [id])), /require an administrator/);
    await db.exec("ALTER TABLE profiles ADD COLUMN location_id uuid");
    await assert.rejects(asCoreRole(db, "authenticated", id, () => db.query("UPDATE profiles SET location_id=$1 WHERE id=$1", [id])), /require an administrator/);
    await db.exec(coreSql("fix-rls-profile-role.sql"));
    // Trusted provisioning is still possible, and no recursive RLS policy is used.
    const provisioned = await asCoreRole(db, "service_role", id, () => db.query("UPDATE profiles SET role='corporate' WHERE id=$1 RETURNING role", [id]));
    assert.equal(provisioned.rows[0].role, "corporate");
  } finally { await db.close(); }
});

test("SEC-01: direct self-profile INSERT cannot request an elevated role", async () => {
  const db = await createCoreDatabase(["fix-rls-profile-role.sql"]);
  try {
    await db.query("INSERT INTO auth.users VALUES ($1, 'qa@test.invalid', '{}')", [id]);
    await db.query("DELETE FROM profiles WHERE id=$1", [id]);
    await assert.rejects(asCoreRole(db, "authenticated", id, () => db.query("INSERT INTO profiles(id,email,full_name,restaurant_name,role) VALUES ($1,'qa@test.invalid','QA','Tenant','corporate')", [id])), /require an administrator/);
    const row = await asCoreRole(db, "authenticated", id, () => db.query("INSERT INTO profiles(id,email,full_name,restaurant_name) VALUES ($1,'qa@test.invalid','QA','Tenant') RETURNING role", [id]));
    assert.equal(row.rows[0].role, "staff");
  } finally { await db.close(); }
});
