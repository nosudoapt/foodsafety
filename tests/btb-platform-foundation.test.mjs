import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformDatabase, seedPlatform, IDS, call } from "./helpers/btb-platform-database.mjs";

test("location foundation enforces membership, capabilities, personal sessions and durable email leases", async (t) => {
  const db = await createPlatformDatabase("foundation");
  t.after(() => db.close()); await seedPlatform(db);
  await t.test("manager sees only assigned locations; corporate sees the group; revoked sessions fail", async () => {
    const boot = await call(db,"btb_platform_bootstrap",{p_actor:IDS.manager,p_session:1});
    assert.deepEqual(boot.locations.map(l=>l.id),[IDS.a]);
    assert.equal((await call(db,"btb_platform_bootstrap",{p_actor:IDS.corporate,p_session:1})).locations.length,2);
    await assert.rejects(call(db,"btb_platform_bootstrap",{p_actor:IDS.manager,p_session:2}), /Personal session/);
    await assert.rejects(call(db,"btb_platform_assert",{p_actor:IDS.manager,p_session:1,p_location:IDS.b,p_capability:"inventory.read"}), /Location not permitted/);
    await assert.rejects(call(db,"btb_platform_assert",{p_actor:IDS.staff,p_session:1,p_location:IDS.a,p_capability:"inventory.read"}), /Role not permitted/);
    await assert.rejects(call(db,"btb_platform_assert",{p_actor:IDS.designer,p_session:1,p_location:IDS.a,p_capability:"marketing.approve"}), /Role not permitted/);
    await assert.rejects(call(db,"btb_platform_assert",{p_actor:IDS.designer,p_session:1,p_location:IDS.a,p_capability:"compliance.read"}), /Role not permitted/);
  });
  await t.test("browser roles cannot read private tables or invoke platform RPCs", async () => {
    for(const role of ["anon","authenticated"]){
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query("SELECT * FROM btb_file_objects"),/permission denied/);
      await assert.rejects(call(db,"btb_platform_bootstrap",{p_actor:IDS.owner,p_session:1}),/permission denied/);
      await db.exec("RESET ROLE");
    }
  });
  await t.test("email claims cannot double-send; success needs a provider ID; uncertain old retries stop",async()=>{
    await db.exec("INSERT INTO btb_email_jobs(dedupe_key,kind,recipient,subject,body) VALUES('one','test','owner@test.invalid','Test','Body')");
    const first=(await db.query("SELECT * FROM btb_claim_email_jobs(20)")).rows;
    assert.equal(first.length,1); assert.equal((await db.query("SELECT * FROM btb_claim_email_jobs(20)")).rows.length,0);
    assert.equal(await call(db,"btb_finish_email_job",{p_id:first[0].id,p_lease:IDS.a,p_provider:"provider-1",p_error:null,p_uncertain:false}),false);
    assert.equal(await call(db,"btb_finish_email_job",{p_id:first[0].id,p_lease:first[0].lease_token,p_provider:null,p_error:"Timed out",p_uncertain:true}),true);
    await db.exec("UPDATE btb_email_jobs SET available_at=now()-interval '1 day',first_attempt_at=now()-interval '24 hours'");
    assert.equal((await db.query("SELECT * FROM btb_claim_email_jobs(20)")).rows.length,0);
    await assert.rejects(db.exec("UPDATE btb_email_jobs SET status='accepted'"),/check constraint/);
  });
});
