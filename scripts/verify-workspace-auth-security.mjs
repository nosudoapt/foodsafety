#!/usr/bin/env node
// Rehearse the migration in a rolled-back transaction, or verify the cutover.
// Credentials are compared in memory and are never printed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import postgres from 'postgres';

const require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
if(!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required');
const db=postgres(process.env.SUPABASE_DB_URL,{max:1,prepare:false,ssl:'require',onnotice(){}});
const rehearse=process.argv.includes('--rehearse');

async function verify(sql) {
  const [counts]=await sql`SELECT
    (SELECT count(*)::int FROM workspace_archived_credentials) AS archived,
    (SELECT count(*)::int FROM btb_employee_credentials c JOIN workspace_credential_links l USING(employee_id)) AS duplicate_credentials,
    (SELECT count(*)::int FROM btb_employees e JOIN workspace_credential_links l ON l.employee_id=e.id WHERE e.login_enabled) AS enabled_duplicates,
    (SELECT count(*)::int FROM workspace_principals) AS principals`;
  assert.ok(counts.archived>=2,'Both audited collisions must be archived');
  assert.equal(counts.duplicate_credentials,0,'Linked duplicate credentials must be removed from the live store');
  assert.equal(counts.enabled_duplicates,0,'Linked duplicates cannot sign in');
  const [signup]=await sql`SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS definition`;
  assert.match(signup.definition,/'staff',NULL,NULL/);
  assert.doesNotMatch(signup.definition,/raw_user_meta_data->>'(role|location_id|tenant_id)'/);
  const [grants]=await sql`SELECT
    has_table_privilege('anon','public.locations','SELECT') AS public_locations,
    has_function_privilege('anon','public.workspace_auth_candidate(text)','EXECUTE') AS public_credentials,
    has_function_privilege('authenticated','public.workspace_auth_context(uuid)','EXECUTE') AS browser_context,
    has_table_privilege('authenticated','public.cleaning_logs','UPDATE') AS cleaning_update,
    has_table_privilege('anon','public.cash_outs','INSERT') AS cashout_insert`;
  assert.ok(Object.values(grants).every(value=>value===false),'Auth/locations and operational writes must not be public');
  const [profile]=await sql`SELECT id FROM profiles LIMIT 1`;
  if(profile) for(const expression of ["role=CASE WHEN role='staff' THEN 'corporate' ELSE 'staff' END","tenant_id='00000000-0000-0000-0000-000000000001'","location_id='00000000-0000-0000-0000-000000000001'"]) {
    let denied=false;
    try {
      await sql.savepoint(async scoped=>{
        await scoped`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:profile.id,role:'authenticated'})},true)`;
        await scoped.unsafe('SET LOCAL ROLE authenticated');
        await scoped.unsafe(`UPDATE public.profiles SET ${expression} WHERE id='${profile.id}'`);
        throw new Error('Profile privilege update was not refused');
      });
    } catch(error) { if(error.code==='42501') denied=true; else throw error; }
    assert.ok(denied,'Non-service role profile privilege changes must fail');
  }
  for(const row of await sql`SELECT workspace_auth_context(id) AS context FROM workspace_principals`) {
    const context=row.context;
    assert.ok(context && !('passwordHash' in context),'Request-time auth must not return hashes');
    if(context.locations?.length) {
      const ids=context.locations.map(site=>site.id);
      const [valid]=await sql`SELECT count(*)::int AS count FROM locations WHERE id IN ${sql(ids)} AND tenant_id=${context.tenantId} AND active`;
      assert.equal(valid.count,ids.length,'Every active assignment must belong to the authenticated tenant');
    }
  }
  return counts;
}

try {
  if(rehearse) {
    const migration=fs.readFileSync(new URL('../supabase/schema-workspace-auth-cutover.sql',import.meta.url),'utf8')
      .replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
    let counts;
    try {
      await db.begin(async sql=>{
        const before=await sql`SELECT 'console' kind,id,password_hash hash FROM btb_super_admins UNION ALL SELECT 'supabase',id,encrypted_password FROM auth.users`;
        await sql.unsafe(migration);
        counts=await verify(sql);
        const after=await sql`SELECT 'console' kind,id,password_hash hash FROM btb_super_admins UNION ALL SELECT 'supabase',id,encrypted_password FROM auth.users`;
        assert.equal(before.length,after.length);
        for(const original of before) assert.ok(after.some(row=>row.kind===original.kind&&row.id===original.id&&row.hash===original.hash),'Authoritative password hashes must remain unchanged');
        throw new Error('REHEARSAL_ROLLBACK');
      });
    } catch(error) { if(error.message!=='REHEARSAL_ROLLBACK') throw error; }
    console.log(JSON.stringify({rehearsal:'passed and rolled back',authoritativeHashes:'unchanged',...counts},null,2));
  } else {
    const counts=await db.begin(async sql=>{
      const result=await verify(sql);
      // Verification probes may issue a refused UPDATE; do not commit probes.
      return result;
    });
    console.log(JSON.stringify({verification:'passed',...counts},null,2));
  }
} catch(error) {
  console.error(`Workspace auth verification failed: ${error.message}`);
  process.exitCode=1;
} finally { await db.end({timeout:5}); }
