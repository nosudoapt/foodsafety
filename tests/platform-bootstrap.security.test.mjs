import { test } from "node:test";
import assert from "node:assert/strict";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";

test("HTTP-05: historical browser grants expose the owner hash; new RLS blocks reads and mutations even with restored grants", async () => {
  const db = await createCoreDatabase();
  try {
    await db.exec(coreSql("schema-platform-admin.sql"));
    await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON platform_auth TO anon,authenticated,service_role; INSERT INTO platform_auth(id,passcode_hash) VALUES(1,'synthetic-owner-hash')");
    assert.equal((await asCoreRole(db, "anon", null, () => db.query("SELECT * FROM platform_auth"))).rows.length, 1);
    assert.equal((await asCoreRole(db, "authenticated", null, () => db.query("UPDATE platform_auth SET passcode_hash='synthetic-attacker-hash' RETURNING passcode_hash"))).rows[0].passcode_hash, "synthetic-attacker-hash");
    await db.exec(coreSql("fix-platform-bootstrap-security.sql"));
    await db.exec(coreSql("fix-platform-bootstrap-security.sql"));
    await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON platform_auth TO anon,authenticated; CREATE POLICY historical_open ON platform_auth FOR ALL USING(true) WITH CHECK(true)");
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await asCoreRole(db, role, null, () => db.query("SELECT * FROM platform_auth"))).rows.length, 0);
      assert.equal((await asCoreRole(db, role, null, () => db.query("UPDATE platform_auth SET passcode_hash='synthetic-attacker-hash' RETURNING id"))).rows.length, 0);
      assert.equal((await asCoreRole(db, role, null, () => db.query("DELETE FROM platform_auth RETURNING id"))).rows.length, 0);
      await assert.rejects(asCoreRole(db, role, null, () => db.query("INSERT INTO platform_auth(id,passcode_hash) VALUES(1,'synthetic-attacker-hash')")), /row-level security/);
    }
    assert.equal((await asCoreRole(db, "service_role", null, () => db.query("SELECT * FROM platform_auth"))).rows.length, 1);
  } finally { await db.close(); }
});

test("HTTP-05: two pre-read bootstrap claims overwrite with UPSERT; insert-only admits one winner", async () => {
  const db = await createCoreDatabase();
  try {
    await db.exec(coreSql("schema-platform-admin.sql"));
    const lookup = () => db.query("SELECT passcode_hash FROM platform_auth WHERE id=1");
    const snapshots = await Promise.all([lookup(), lookup()]);
    assert.ok(snapshots.every(result => result.rows.length === 0));
    const unsafe = hash => db.query("INSERT INTO platform_auth(id,passcode_hash) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET passcode_hash=excluded.passcode_hash", [hash]);
    await Promise.all([unsafe("synthetic-first-hash"), unsafe("synthetic-second-hash")]);
    assert.equal((await lookup()).rows[0].passcode_hash, "synthetic-second-hash", "Reproduce the old overwrite after both saw no stored hash");
    await db.exec("DELETE FROM platform_auth");
    const insert = hash => db.query("INSERT INTO platform_auth(id,passcode_hash) VALUES(1,$1)", [hash]);
    const claims = await Promise.allSettled([insert("synthetic-first-hash"), insert("synthetic-second-hash")]);
    assert.equal(claims.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(claims.find(result => result.status === "rejected").reason.code, "23505");
    assert.equal((await lookup()).rows[0].passcode_hash, "synthetic-first-hash");
    // PGlite is single-session: unique-constraint semantics are executable;
    // distributed Postgres connection races still require staging evidence.
  } finally { await db.close(); }
});
