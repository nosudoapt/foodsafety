-- Step 34: live page grants at server, PostgREST and transactional boundaries.
-- Requires steps 32-33 and the existing offline-replay/platform releases.
-- Written here, NOT applied. Historical unscoped tokens fail closed.
BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public.btb_employee_page_grants(uuid)') IS NULL
    OR to_regprocedure('public.btb_replay_prep_save(date,text,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Install the BTB console, invitation and offline replay releases before step 34' USING ERRCODE='42P01';
  END IF;
END $$;

-- SQL mirror of btb-access.ts / btb-hub.ts. A parity test checks every page and
-- role; client-controlled allowed rows can narrow, never broaden this ceiling.
CREATE TABLE IF NOT EXISTS public.btb_page_permissions (
  page text PRIMARY KEY, view_roles text[] NOT NULL, edit_roles text[] NOT NULL
);
WITH groups(name,view_roles,edit_roles) AS (VALUES
  ('admin',ARRAY['admin'],ARRAY['admin']),
  ('ops',ARRAY['staff','supervisor','manager','corporate','owner'],ARRAY['staff','supervisor','manager']),
  ('store',ARRAY['staff','supervisor','manager','corporate','owner'],ARRAY['manager']),
  ('roster',ARRAY['staff','supervisor','manager','corporate','owner'],ARRAY['supervisor','manager']),
  ('loyalty',ARRAY['staff','supervisor','manager','corporate','owner'],ARRAY[]::text[]),
  ('reference',ARRAY['staff','supervisor','manager','corporate','owner','designer'],ARRAY[]::text[]),
  ('safety',ARRAY['staff','supervisor','manager','corporate','owner','designer'],ARRAY['manager']),
  ('leads',ARRAY['supervisor','manager','corporate','owner'],ARRAY['supervisor','manager']),
  ('compliance',ARRAY['supervisor','manager','corporate','owner'],ARRAY['manager']),
  ('management',ARRAY['manager','corporate'],ARRAY['manager','corporate']),
  ('corporate',ARRAY['corporate','owner'],ARRAY['corporate','owner']),
  ('branding',ARRAY['supervisor','manager','designer','corporate','owner'],ARRAY['manager']),
  ('marketing',ARRAY['manager','designer','corporate','owner'],ARRAY['manager','corporate','owner']),
  ('platform',ARRAY['staff','supervisor','manager','designer','corporate','owner'],ARRAY['staff','supervisor','manager'])
), pages(page,group_name) AS (VALUES
  ('admin','admin'),('platform','platform'),('prep-list','ops'),('checklists','ops'),
  ('cash-out','store'),('staff-schedule','roster'),('employees','leads'),
  ('loyalty-rewards','loyalty'),('licence-reminders','management'),('tax-dates','store'),
  ('training-guide','store'),('month-end-inventory','store'),('branding-requests','branding'),
  ('order-sheet','leads'),('cleaning-schedule','ops'),('temperatures','ops'),
  ('prep-manual','reference'),('menu','reference'),('allergen-chart','reference'),
  ('gluten-free','reference'),('fryer-timing','reference'),('emergency','safety'),
  ('protocols','safety'),('handbook','safety'),('manuals','safety'),
  ('compliance','compliance'),('documents','compliance'),('staff-licenses','compliance'),
  ('inspections','management'),('franchise-inspection','corporate'),('marketing','marketing'),
  ('new-restaurant','corporate'),('vault','management')
)
INSERT INTO public.btb_page_permissions(page,view_roles,edit_roles)
SELECT p.page,g.view_roles,g.edit_roles FROM pages p JOIN groups g ON g.name=p.group_name
ON CONFLICT(page) DO UPDATE SET view_roles=excluded.view_roles,edit_roles=excluded.edit_roles;
ALTER TABLE public.btb_page_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_page_permissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.btb_page_permissions TO service_role;

CREATE OR REPLACE FUNCTION public.btb_effective_page_allowed(p_role text,p_employee uuid,p_page text,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE grants jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM btb_page_permissions WHERE page=p_page AND p_role=ANY(view_roles)
    AND (NOT p_write OR p_role=ANY(edit_roles))) THEN RETURN false; END IF;
  IF p_page='admin' THEN RETURN true; END IF;
  IF EXISTS(SELECT 1 FROM role_page_access WHERE role=p_role AND page=p_page AND NOT allowed) THEN RETURN false; END IF;
  IF p_employee IS NOT NULL THEN
    grants:=btb_employee_page_grants(p_employee);
    IF grants->'pageGrants'<>'null'::jsonb AND NOT (grants->'pageGrants' ? p_page) THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.btb_effective_page_allowed(text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_effective_page_allowed(text,uuid,text,boolean) TO service_role;

CREATE TABLE IF NOT EXISTS public.btb_public_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  restaurant_name text NOT NULL, expires_at timestamptz NOT NULL,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.btb_public_tokens ADD COLUMN IF NOT EXISTS page text REFERENCES public.btb_page_permissions(page);
ALTER TABLE public.btb_public_tokens ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE public.btb_public_tokens ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.btb_employees(id);
ALTER TABLE public.btb_public_tokens ADD COLUMN IF NOT EXISTS session_version integer;
ALTER TABLE public.btb_public_tokens ADD COLUMN IF NOT EXISTS can_write boolean NOT NULL DEFAULT false;
ALTER TABLE public.btb_public_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_public_tokens FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.btb_public_tokens TO service_role;
CREATE INDEX IF NOT EXISTS btb_public_tokens_expiry ON public.btb_public_tokens(expires_at);

CREATE OR REPLACE FUNCTION public.btb_public_capability(p_page text,p_write boolean DEFAULT false)
RETURNS public.btb_public_tokens LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE raw text; capability btb_public_tokens; grants jsonb;
BEGIN
  BEGIN
    raw:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-btb-public-token';
  EXCEPTION WHEN others THEN RETURN NULL; END;
  IF raw IS NULL OR raw !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO capability FROM btb_public_tokens WHERE token_hash=encode(sha256(convert_to(raw,'UTF8')),'hex')
    AND expires_at>now() AND revoked_at IS NULL AND page IS NOT NULL
    AND restaurant_name='Between the Buns';
  IF NOT FOUND OR p_page IS NOT NULL AND capability.page<>p_page OR p_write AND NOT capability.can_write THEN RETURN NULL; END IF;
  IF capability.employee_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM btb_employees e JOIN btb_employee_credentials c ON c.employee_id=e.id
      WHERE e.id=capability.employee_id AND e.restaurant_name=capability.restaurant_name AND e.active AND e.login_enabled
        AND e.role=capability.actor_role AND c.session_version=capability.session_version) THEN RETURN NULL; END IF;
    grants:=btb_employee_page_grants(capability.employee_id);
    -- Page grants do not reopen legacy operations for location-workspace people.
    -- Safety/reference registers remain independent of those operational tables.
    IF capability.actor_role NOT IN ('corporate','owner')
      AND (grants->'pageGrants'<>'null'::jsonb OR capability.actor_role='designer')
      AND capability.page<>ALL(ARRAY['emergency','protocols','handbook','manuals']) THEN RETURN NULL; END IF;
  ELSIF capability.session_version IS NOT NULL THEN RETURN NULL;
  END IF;
  IF NOT btb_effective_page_allowed(capability.actor_role,capability.employee_id,capability.page,p_write) THEN RETURN NULL; END IF;
  RETURN capability;
END $$;
REVOKE ALL ON FUNCTION public.btb_public_capability(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_public_capability(text,boolean) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.btb_public_restaurant()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT (public.btb_public_capability(NULL,false)).restaurant_name
$$;
REVOKE ALL ON FUNCTION public.btb_public_restaurant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_public_restaurant() TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.btb_public_page(p_page text,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT (public.btb_public_capability(p_page,p_write)).token_hash IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.btb_public_page(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_public_page(text,boolean) TO anon,authenticated,service_role;

-- Location-only legacy tables have no restaurant_name column. Their RLS must
-- not read the private settings table as the browser role (or grant that role
-- access to it). Expose only this server-owned tenant predicate instead.
CREATE OR REPLACE FUNCTION public.btb_location_belongs_to_workspace(p_location uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p_location IS NULL OR EXISTS(SELECT 1 FROM public.btb_location_settings WHERE location_id=p_location)
$$;
REVOKE ALL ON FUNCTION public.btb_location_belongs_to_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_location_belongs_to_workspace(uuid) TO anon,authenticated,service_role;

-- Four operation-specific restrictive policies prevent a later broad demo
-- policy from reopening reads OR writes. Existing FoodSafe auth policies stay
-- in place, with the same BTB-only tenant boundary as the uploader release.
DO $$
DECLARE t text; page_name text; tenant text; page_check text; read_check text; write_check text; auth_check text; pol text;
BEGIN
  FOR t,page_name IN SELECT * FROM (VALUES
    ('compliance_documents','compliance'),('business_documents','documents'),('staff_licenses','staff-licenses'),
    ('inhouse_inspections','inspections'),('corporate_inspections','inspections'),('emergency_contacts','emergency'),
    ('operational_protocols','protocols'),('handbook_documents','handbook'),('print_manuals','manuals'),
    ('marketing_promotions','marketing'),('social_media_calendar','marketing'),('new_restaurant_tasks','new-restaurant'),
    ('prep_counts','prep-list'),('order_sheets','order-sheet'),('cleaning_logs','cleaning-schedule'),
    ('cash_outs','cash-out'),('branding_requests','branding-requests'),('corporate_dates','tax-dates'),
    ('handbook_signatures','handbook'),('login_vault','vault')
  ) mapping LOOP
    IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Missing legacy table: %',t USING ERRCODE='42P01'; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO anon,service_role',t);
    FOREACH pol IN ARRAY ARRAY[t||'_btb_public',t||'_public_all',t||'_btb_token_allow',t||'_btb_token_boundary',
      'btb_page_read','btb_page_write','btb_page_boundary','btb_insert_boundary','btb_update_boundary','btb_delete_boundary','btb_workspace_boundary'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',pol,t);
    END LOOP;
    IF t IN ('cash_outs','branding_requests','corporate_dates') THEN
      tenant:=format('public.btb_location_belongs_to_workspace(%I.location_id)',t);
      auth_check:=format('(NOT %s OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.restaurant_name=''Between the Buns''))',tenant);
    ELSIF t='handbook_signatures' THEN
      tenant:='false';
      auth_check:='EXISTS(SELECT 1 FROM public.handbook_documents h WHERE h.id=handbook_id AND (h.restaurant_name<>''Between the Buns'' OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.restaurant_name=''Between the Buns'')))';
    ELSE
      tenant:='restaurant_name=public.btb_public_restaurant()';
      auth_check:='(restaurant_name<>''Between the Buns'' OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.restaurant_name=''Between the Buns''))';
    END IF;
    IF t='login_vault' THEN tenant:='false'; END IF;
    IF t='corporate_inspections' THEN
      page_check:='public.btb_public_page(CASE WHEN inspection_type=''in-house'' THEN ''inspections'' ELSE ''franchise-inspection'' END,%s)';
    ELSE page_check:=format('public.btb_public_page(%L,%%s)',page_name); END IF;
    read_check:=format('(%s) AND (%s)',tenant,format(page_check,'false'));
    write_check:=format('(%s) AND (%s)',tenant,format(page_check,'true'));
    EXECUTE format('CREATE POLICY btb_page_read ON public.%I FOR SELECT TO anon USING (%s)',t,read_check);
    EXECUTE format('CREATE POLICY btb_page_write ON public.%I FOR ALL TO anon USING (%s) WITH CHECK (%s)',t,write_check,write_check);
    EXECUTE format('CREATE POLICY btb_page_boundary ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (%s) WITH CHECK (%s)',t,read_check,read_check);
    EXECUTE format('CREATE POLICY btb_insert_boundary ON public.%I AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (%s)',t,write_check);
    EXECUTE format('CREATE POLICY btb_update_boundary ON public.%I AS RESTRICTIVE FOR UPDATE TO anon USING (%s) WITH CHECK (%s)',t,write_check,write_check);
    EXECUTE format('CREATE POLICY btb_delete_boundary ON public.%I AS RESTRICTIVE FOR DELETE TO anon USING (%s)',t,write_check);
    EXECUTE format('CREATE POLICY btb_workspace_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',t,auth_check,auth_check);
  END LOOP;
END $$;

-- Saved restrictions themselves are a server-only capability, not a public
-- table that an attacker can edit to re-enable a page.
ALTER TABLE public.role_page_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rpa_public_all ON public.role_page_access;
DROP POLICY IF EXISTS btb_role_page_boundary ON public.role_page_access;
CREATE POLICY btb_role_page_boundary ON public.role_page_access AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.role_page_access FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.role_page_access TO service_role;

-- Preserve the atomic receipt implementation; put a checked, page-scoped
-- entry point in front of it. The internal function is never a public RPC.
DO $$ BEGIN
  IF to_regprocedure('public.btb_replay_prep_save_atomic(date,text,jsonb,text)') IS NULL THEN
    ALTER FUNCTION public.btb_replay_prep_save(date,text,jsonb,text) RENAME TO btb_replay_prep_save_atomic;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.btb_replay_prep_save_atomic(date,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.btb_replay_prep_save(p_date date,p_scope text,p_rows jsonb,p_replay_key text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE capability btb_public_tokens; prior_actor text; affected bigint;
BEGIN
  capability:=btb_public_capability('prep-list',true);
  IF capability.token_hash IS NULL THEN RAISE EXCEPTION 'Prep page write access required' USING ERRCODE='42501'; END IF;
  -- Personal receipts keep their actor even though browser BTB requests always
  -- run as anon; an unrelated FoodSafe cookie can never become their author.
  prior_actor:=current_setting('request.jwt.claim.sub',true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(capability.employee_id::text,''),true);
  affected:=btb_replay_prep_save_atomic(p_date,p_scope,p_rows,p_replay_key);
  PERFORM set_config('request.jwt.claim.sub',coalesce(prior_actor,''),true);
  RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.btb_replay_prep_save(date,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_replay_prep_save(date,text,jsonb,text) TO anon,authenticated,service_role;

-- The platform's existing transactional capability/membership checks remain
-- intact. Revalidate the page grant in its common personal-session resolver.
CREATE OR REPLACE FUNCTION public.btb_platform_actor(p_actor uuid,p_session integer)
RETURNS public.btb_employees LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE actor btb_employees;
BEGIN
  SELECT e.* INTO actor FROM btb_employees e JOIN btb_employee_credentials c ON c.employee_id=e.id
  WHERE e.id=p_actor AND e.restaurant_name='Between the Buns' AND e.active AND e.login_enabled AND c.session_version=p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personal session required' USING ERRCODE='42501'; END IF;
  IF NOT btb_effective_page_allowed(actor.role,actor.id,'platform',false) THEN
    RAISE EXCEPTION 'Location Workspace page is not enabled' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.btb_platform_actor(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_platform_actor(uuid,integer) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
