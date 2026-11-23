import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql=fs.readFileSync(new URL('../supabase/schema-workspace-auth-cutover.sql',import.meta.url),'utf8');
test('unified signup ignores privilege and assignment metadata',()=>{
  const signup=sql.split('CREATE OR REPLACE FUNCTION public.handle_new_user()')[1].split('ALTER TABLE public.profiles')[0];
  assert.match(signup,/'staff',NULL,NULL/);
  assert.doesNotMatch(signup,/raw_user_meta_data->>'(role|tenant_id|location_id)'/);
});
test('collision cleanup archives and links without changing authoritative hashes',()=>{
  assert.match(sql,/INSERT INTO public.workspace_archived_credentials/);
  assert.match(sql,/UPDATE public.btb_employees e SET login_enabled=false/);
  assert.match(sql,/DELETE FROM public.btb_employee_credentials c USING public.workspace_credential_links/);
  assert.doesNotMatch(sql,/UPDATE (?:public\.)?btb_super_admins SET password_hash|UPDATE auth\.users/);
});
test('non-service profile changes and implicit locations fail closed',()=>{
  assert.match(sql,/current_user <> 'service_role'/);
  for(const field of ['role','location_id','tenant_id']) assert.match(sql,new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`));
  assert.match(sql,/l\.tenant_id=tenant\.id AND l\.active/);
  assert.match(sql,/REVOKE ALL ON public\.locations,public\.location_members FROM anon/);
});
