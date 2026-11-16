import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCoreDatabase, coreSql } from "./helpers/core-database.mjs";

test("SEC-02: historical signup escalation reproduces; every untrusted metadata role now creates staff", async () => {
  const db = await createCoreDatabase(["fix-rls-profile-role.sql"]);
  try {
    const before = randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1,'before@test.invalid','{\"role\":\"corporate\"}')", [before]);
    assert.equal((await db.query("SELECT role FROM profiles WHERE id=$1", [before])).rows[0].role, "corporate");
    await db.exec(coreSql("fix-signup-role.sql"));
    await db.exec(coreSql("fix-signup-role.sql"));
    for (const role of ["staff", "manager", "owner", "multi_location_owner", "corporate", "designer", "made-up", "", null]) {
      const id = randomUUID();
      await db.query("INSERT INTO auth.users VALUES ($1,'after@test.invalid',$2)", [id, JSON.stringify({ role, full_name: "QA person", restaurant_name: "QA tenant", trial: "1" })]);
      const row = (await db.query("SELECT *, trial_ends_at > now() + interval '29 days' AS trial_valid FROM profiles WHERE id=$1", [id])).rows[0];
      assert.equal(row.role, "staff", `Untrusted signup role: ${role}`);
      assert.equal(row.full_name, "QA person");
      assert.equal(row.trial_valid, true);
    }
    // An already provisioned administrator is not silently demoted by this fix.
    assert.equal((await db.query("SELECT role FROM profiles WHERE id=$1", [before])).rows[0].role, "corporate");
  } finally { await db.close(); }
});
