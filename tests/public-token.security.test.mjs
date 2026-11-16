import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createCoreDatabase, asCoreRole, coreSql } from "./helpers/core-database.mjs";

test("PUB-01/PUB-02/PUB-03: real anon RLS limits CRUD to the token's restaurant", async () => {
  const db = await createCoreDatabase();
  try {
    await db.exec(coreSql("schema-rbac.sql"));
    await db.exec(coreSql("schema-compliance.sql"));
    await db.exec(coreSql("schema-features.sql"));
    await db.exec(coreSql("schema-btb-public.sql"));
    await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon");
    await db.exec("INSERT INTO compliance_documents(restaurant_name,doc_type,name) VALUES ('Tenant A','other','A'),('Tenant B','other','B'); INSERT INTO prep_counts(restaurant_name,item_name) VALUES ('Tenant A','A'),('Tenant B','B')");
    assert.equal((await asCoreRole(db, "anon", null, () => db.query("SELECT * FROM compliance_documents"))).rows.length, 2, "Reproduce the historical unrestricted read");
    await db.exec(coreSql("fix-btb-public-token-scope.sql"));
    await db.exec(coreSql("fix-btb-public-token-scope.sql"));
    const a = randomBytes(32).toString("hex"), b = randomBytes(32).toString("hex"), expired = randomBytes(32).toString("hex");
    for (const [token, restaurant, minutes] of [[a,"Tenant A",10],[b,"Tenant B",10],[expired,"Tenant A",-1]]) {
      await db.query("INSERT INTO btb_public_tokens(token_hash,restaurant_name,expires_at) VALUES ($1,$2,now()+($3||' minutes')::interval)", [createHash("sha256").update(token).digest("hex"), restaurant, minutes]);
    }
    const anon = (token, action) => asCoreRole(db, "anon", null, async () => {
      await db.query("SELECT set_config('request.headers',$1,true)", [JSON.stringify({ "x-btb-public-token": token })]);
      return action();
    });
    for (const token of [undefined, "invalid", "0".repeat(64), expired]) assert.equal((await anon(token, () => db.query("SELECT * FROM compliance_documents"))).rows.length, 0);
    for (const [token, own, other] of [[a,"Tenant A","Tenant B"],[b,"Tenant B","Tenant A"]]) {
      assert.deepEqual((await anon(token, () => db.query("SELECT restaurant_name FROM compliance_documents"))).rows.map(r=>r.restaurant_name), [own]);
      assert.equal((await anon(token, () => db.query("DELETE FROM compliance_documents WHERE restaurant_name=$1 RETURNING id", [other]))).rows.length, 0);
      assert.equal((await anon(token, () => db.query("UPDATE prep_counts SET on_hand=999 WHERE restaurant_name=$1 RETURNING id", [other]))).rows.length, 0);
      assert.equal((await anon(token, () => db.query("UPDATE prep_counts SET on_hand=3 WHERE restaurant_name=$1 RETURNING on_hand::int", [own]))).rows[0].on_hand, 3);
      await assert.rejects(anon(token, () => db.query("INSERT INTO compliance_documents(restaurant_name,doc_type,name) VALUES ($1,'other','forged')", [other])), /row-level security/);
      await assert.rejects(anon(token, () => db.query("UPDATE prep_counts SET restaurant_name=$1 WHERE restaurant_name=$2", [other,own])), /row-level security/);
      await assert.rejects(anon(token, () => db.query("SELECT * FROM btb_public_tokens")), /permission denied/);
    }
    // Handbook signatures inherit the document tenant, not a client tenant field.
    await db.exec("INSERT INTO handbook_documents(restaurant_name,title) VALUES ('Tenant A','A'),('Tenant B','B'); INSERT INTO handbook_signatures(handbook_id,staff_name,signature) SELECT id,'QA','QA' FROM handbook_documents");
    assert.equal((await anon(a, () => db.query("SELECT * FROM handbook_signatures"))).rows.length, 1);
    // Even accidentally reinstalling a broad public policy cannot undo the boundary.
    await db.exec(coreSql("schema-btb-public.sql"));
    assert.equal((await anon(a, () => db.query("SELECT * FROM compliance_documents"))).rows.length, 1);
    assert.equal((await anon(undefined, () => db.query("SELECT * FROM compliance_documents"))).rows.length, 0);
  } finally { await db.close(); }
});
