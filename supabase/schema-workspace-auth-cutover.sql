-- Unified email/password prerequisites. Existing provider hashes are retained.
-- Unknown legacy ownership is NOT inferred from a default/home location.
BEGIN;

CREATE TABLE public.workspace_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workspace_tenant_name ON public.workspace_tenants(lower(trim(name)));
INSERT INTO public.workspace_tenants(name,slug) VALUES ('Between the Buns','between-the-buns');
INSERT INTO public.workspace_tenants(name,slug)
SELECT DISTINCT trim(restaurant_name),
  'workspace-' || substr(md5(lower(trim(restaurant_name))),1,16)
FROM public.profiles WHERE nullif(trim(restaurant_name),'') IS NOT NULL
  AND lower(trim(restaurant_name)) <> 'between the buns';

ALTER TABLE public.locations ADD COLUMN tenant_id uuid REFERENCES public.workspace_tenants(id);
ALTER TABLE public.locations ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.workspace_tenants(id);
ALTER TABLE public.profiles ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE public.btb_employees ADD COLUMN tenant_id uuid REFERENCES public.workspace_tenants(id);
ALTER TABLE public.btb_super_admins ADD COLUMN tenant_id uuid REFERENCES public.workspace_tenants(id);

-- The managed BTB register is authoritative for these locations, not a
-- per-console-user membership and not proof of any other restaurant's ownership.
UPDATE public.locations l SET tenant_id=t.id FROM public.workspace_tenants t
WHERE t.slug='between-the-buns' AND EXISTS (
  SELECT 1 FROM public.btb_superadmin_locations m WHERE m.location_id=l.id
);
UPDATE public.profiles p SET tenant_id=t.id FROM public.workspace_tenants t
WHERE lower(trim(p.restaurant_name))=lower(trim(t.name));
UPDATE public.btb_employees e SET tenant_id=t.id FROM public.workspace_tenants t
WHERE t.slug='between-the-buns' AND e.restaurant_name='Between the Buns';
UPDATE public.btb_super_admins SET tenant_id=(SELECT id FROM public.workspace_tenants WHERE slug='between-the-buns');

CREATE TABLE public.workspace_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_type text NOT NULL CHECK (principal_type IN ('console','supabase','employee')),
  credential_id uuid NOT NULL,
  normalized_email text NOT NULL UNIQUE CHECK (normalized_email=lower(trim(normalized_email))),
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version>0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(principal_type,credential_id)
);
CREATE TABLE public.workspace_credential_links (
  employee_id uuid PRIMARY KEY REFERENCES public.btb_employees(id),
  principal_id uuid NOT NULL REFERENCES public.workspace_principals(id),
  reason text NOT NULL DEFAULT 'normalized-email collision; authoritative higher-priority credential retained',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_archived_credentials (
  employee_id uuid PRIMARY KEY REFERENCES public.btb_employees(id),
  principal_id uuid NOT NULL REFERENCES public.workspace_principals(id),
  password_hash text NOT NULL,
  session_version integer NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_console_locations (
  console_id uuid NOT NULL REFERENCES public.btb_super_admins(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  PRIMARY KEY(console_id,location_id)
);
-- Explicitly materialize existing console responsibility. No employee role
-- (including owner/corporate/designer) receives an implicit location membership.
INSERT INTO public.workspace_console_locations(console_id,location_id)
SELECT c.id,m.location_id FROM public.btb_super_admins c
JOIN public.locations l ON l.tenant_id=c.tenant_id
JOIN public.btb_superadmin_locations m ON m.location_id=l.id;

CREATE FUNCTION public.workspace_sync_principals() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.workspace_principals(principal_type,credential_id,normalized_email)
  SELECT kind,id,email FROM (
    SELECT kind,id,email,row_number() OVER (PARTITION BY email ORDER BY priority,id) AS rank
    FROM (
      SELECT 'console'::text kind,id,lower(trim(email)) email,0 priority FROM public.btb_super_admins
      UNION ALL
      SELECT 'supabase',u.id,lower(trim(u.email)),
        CASE WHEN p.role IN ('owner','corporate','supervisor') THEN 1 ELSE 2 END
      FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.email IS NOT NULL
      UNION ALL
      SELECT 'employee',id,lower(trim(email)),3 FROM public.btb_employees WHERE email IS NOT NULL
    ) candidates WHERE nullif(email,'') IS NOT NULL
  ) ordered WHERE rank=1
  ON CONFLICT(normalized_email) DO UPDATE SET
    principal_type=excluded.principal_type, credential_id=excluded.credential_id,
    session_version=CASE WHEN (workspace_principals.principal_type,workspace_principals.credential_id)
      IS DISTINCT FROM (excluded.principal_type,excluded.credential_id)
      THEN workspace_principals.session_version+1 ELSE workspace_principals.session_version END;
END $$;
SELECT public.workspace_sync_principals();

-- Link BEFORE disabling credentials. Neither authoritative password store is
-- updated, and employee/team history and closed-location assignments are kept.
INSERT INTO public.workspace_credential_links(employee_id,principal_id)
SELECT e.id,p.id FROM public.btb_employees e JOIN public.workspace_principals p
  ON p.normalized_email=lower(trim(e.email))
WHERE p.principal_type<>'employee';
INSERT INTO public.workspace_archived_credentials(employee_id,principal_id,password_hash,session_version)
SELECT c.employee_id,l.principal_id,c.password_hash,c.session_version
FROM public.btb_employee_credentials c JOIN public.workspace_credential_links l USING(employee_id);
UPDATE public.btb_employees e SET login_enabled=false,version=version+1,updated_at=now()
WHERE EXISTS(SELECT 1 FROM public.workspace_credential_links l WHERE l.employee_id=e.id);
DELETE FROM public.btb_employee_credentials c USING public.workspace_credential_links l WHERE c.employee_id=l.employee_id;

CREATE FUNCTION public.workspace_guard_linked_credentials() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_credential_links l
    WHERE l.employee_id=COALESCE(to_jsonb(NEW)->>'employee_id',to_jsonb(NEW)->>'id')::uuid)
    THEN
    IF TG_TABLE_NAME='btb_employee_credentials' THEN
      RAISE EXCEPTION 'This identity uses its linked authoritative credential' USING ERRCODE='42501';
    ELSIF NEW.login_enabled THEN
      RAISE EXCEPTION 'This identity uses its linked authoritative credential' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workspace_linked_employee_credentials BEFORE INSERT OR UPDATE ON public.btb_employee_credentials
FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_linked_credentials();
CREATE TRIGGER workspace_linked_employee_login BEFORE INSERT OR UPDATE OF login_enabled ON public.btb_employees
FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_linked_credentials();

-- Metadata may supply display text, NEVER role, tenant or location assignment.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.profiles(id,email,full_name,restaurant_name,role,location_id,tenant_id,trial_ends_at)
  VALUES(NEW.id,NEW.email,COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    COALESCE(NEW.raw_user_meta_data->>'restaurant_name',''),'staff',NULL,NULL,
    CASE WHEN NEW.raw_user_meta_data->>'trial'='1' THEN now()+interval '30 days' ELSE NULL END);
  RETURN NEW;
END $$;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'staff';
CREATE OR REPLACE FUNCTION public.guard_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    IF TG_OP='UPDATE' AND (
      NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.active IS DISTINCT FROM OLD.active
      OR NEW.restaurant_name IS DISTINCT FROM OLD.restaurant_name
      OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
    ) THEN RAISE EXCEPTION 'Profile privileges require service_role' USING ERRCODE='42501'; END IF;
    IF TG_OP='INSERT' AND (NEW.role<>'staff' OR NEW.location_id IS NOT NULL OR NEW.tenant_id IS NOT NULL)
      THEN RAISE EXCEPTION 'Profile assignments require service_role' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
DROP TRIGGER IF EXISTS profiles_guard_privileges ON public.profiles;
CREATE TRIGGER workspace_profile_privileges BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

CREATE TABLE public.workspace_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid NOT NULL REFERENCES public.workspace_principals(id),
  version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_sessions_principal ON public.workspace_auth_sessions(principal_id);
CREATE TABLE public.workspace_auth_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  window_start timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.workspace_auth_reserve(p_email_key text,p_ip_key text)
RETURNS TABLE(blocked boolean,retry_after integer)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE email_count integer; ip_count integer; email_start timestamptz; ip_start timestamptz;
BEGIN
  -- Fixed lock order closes concurrent-attempt races across app instances.
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-ip:'||p_ip_key,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-email:'||p_email_key,0));
  INSERT INTO public.workspace_auth_limits(key) VALUES('email:'||p_email_key),('ip:'||p_ip_key) ON CONFLICT DO NOTHING;
  UPDATE public.workspace_auth_limits SET attempts=0,window_start=now()
    WHERE key IN ('email:'||p_email_key,'ip:'||p_ip_key) AND window_start<=now()-interval '15 minutes';
  SELECT attempts,window_start INTO email_count,email_start FROM public.workspace_auth_limits WHERE key='email:'||p_email_key;
  SELECT attempts,window_start INTO ip_count,ip_start FROM public.workspace_auth_limits WHERE key='ip:'||p_ip_key;
  IF email_count>=10 OR ip_count>=30 THEN
    RETURN QUERY SELECT true,GREATEST(1,900-EXTRACT(EPOCH FROM(now()-GREATEST(email_start,ip_start)))::int); RETURN;
  END IF;
  -- Pending verification counts too; success releases its IP reservation and
  -- clears email failures, failure keeps it. Public callers cannot invoke this.
  UPDATE public.workspace_auth_limits SET attempts=attempts+1 WHERE key IN ('email:'||p_email_key,'ip:'||p_ip_key);
  RETURN QUERY SELECT false,0;
END $$;
CREATE FUNCTION public.workspace_auth_success(p_email_key text,p_ip_key text) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-ip:'||p_ip_key,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-email:'||p_email_key,0));
  UPDATE public.workspace_auth_limits SET attempts=0 WHERE key='email:'||p_email_key;
  UPDATE public.workspace_auth_limits SET attempts=GREATEST(0,attempts-1) WHERE key='ip:'||p_ip_key;
END $$;

-- Resolves one source BEFORE checking a password. A disabled/missing winner
-- cannot fall through to a lower-priority password store.
CREATE FUNCTION public.workspace_auth_candidate(p_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE principal public.workspace_principals; result jsonb;
BEGIN
  SELECT * INTO principal FROM public.workspace_principals WHERE normalized_email=lower(trim(p_email));
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF principal.principal_type='console' THEN
    SELECT jsonb_build_object('credentialId',c.id,'passwordHash',c.password_hash,'active',c.active,
      'tenantId',c.tenant_id,'role','admin','name',c.name,'email',c.email,'sourceVersion',c.session_version)
    INTO result FROM public.btb_super_admins c WHERE c.id=principal.credential_id;
  ELSIF principal.principal_type='supabase' THEN
    SELECT jsonb_build_object('credentialId',u.id,'passwordHash',u.encrypted_password,
      'active',u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND COALESCE(p.active,true),
      'tenantId',p.tenant_id,'role',COALESCE(p.role,'staff'),'name',COALESCE(p.full_name,''),'email',u.email,
      'sourceVersion',principal.session_version,'trialEndsAt',p.trial_ends_at)
    INTO result FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=principal.credential_id;
  ELSE
    SELECT jsonb_build_object('credentialId',e.id,'passwordHash',c.password_hash,'active',e.active AND e.login_enabled,
      'tenantId',e.tenant_id,'role',e.role,'name',e.name,'email',e.email,'sourceVersion',c.session_version)
    INTO result FROM public.btb_employees e LEFT JOIN public.btb_employee_credentials c ON c.employee_id=e.id WHERE e.id=principal.credential_id;
  END IF;
  RETURN result || jsonb_build_object('sub',principal.id,'principalType',principal.principal_type,
    'version',principal.session_version,'principalActive',principal.active);
END $$;

-- Password-free request-time resolver. Every location requires both an
-- explicit assignment and an active, same-tenant location. No NULL/default site.
CREATE FUNCTION public.workspace_auth_context(p_principal uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE principal public.workspace_principals; candidate jsonb; tenant public.workspace_tenants; sites jsonb;
BEGIN
  SELECT * INTO principal FROM public.workspace_principals WHERE id=p_principal;
  IF NOT FOUND THEN RETURN NULL; END IF;
  candidate:=public.workspace_auth_candidate(principal.normalized_email)-'passwordHash';
  IF candidate IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO tenant FROM public.workspace_tenants WHERE id=(candidate->>'tenantId')::uuid AND active;
  IF NOT FOUND THEN RETURN candidate || jsonb_build_object('locations','[]'::jsonb,'tenantSlug',NULL); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'slug',l.slug,'address',l.address) ORDER BY l.id),'[]'::jsonb)
  INTO sites FROM public.locations l
  WHERE l.tenant_id=tenant.id AND l.active AND COALESCE((SELECT s.active FROM public.btb_location_settings s WHERE s.location_id=l.id),true)
    AND CASE principal.principal_type
      WHEN 'console' THEN EXISTS(SELECT 1 FROM public.workspace_console_locations m WHERE m.console_id=principal.credential_id AND m.location_id=l.id)
      WHEN 'employee' THEN EXISTS(SELECT 1 FROM public.btb_location_access m WHERE m.employee_id=principal.credential_id AND m.location_id=l.id)
      ELSE EXISTS(SELECT 1 FROM public.location_members m WHERE m.user_id=principal.credential_id AND m.location_id=l.id)
        OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=principal.credential_id AND p.location_id=l.id AND p.tenant_id=l.tenant_id)
    END;
  RETURN candidate || jsonb_build_object('locations',sites,'tenantSlug',tenant.slug,'tenantName',tenant.name);
END $$;

CREATE FUNCTION public.workspace_revoke_source_sessions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; source_id uuid;
BEGIN
  IF TG_OP='UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
  source_id:=COALESCE(row_data->>'employee_id',row_data->>'user_id',row_data->>'id')::uuid;
  IF TG_TABLE_NAME IN ('locations','btb_location_settings','btb_location_page_access','role_page_access','workspace_console_locations') THEN
    UPDATE public.workspace_principals SET session_version=session_version+1;
  ELSE
    UPDATE public.workspace_principals p SET session_version=session_version+1
    WHERE p.credential_id=source_id OR EXISTS(SELECT 1 FROM public.workspace_credential_links l WHERE l.employee_id=source_id AND l.principal_id=p.id);
  END IF;
  IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('users','profiles','btb_employees','btb_super_admins') THEN
    PERFORM public.workspace_sync_principals();
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- Password/account/role/assignment changes invalidate already-issued cookies.
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['profiles','btb_employees','btb_employee_credentials','btb_super_admins','location_members','btb_location_access','locations','btb_location_settings','btb_location_page_access','role_page_access','workspace_console_locations'] LOOP
    EXECUTE format('CREATE TRIGGER workspace_revoke_sessions AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.workspace_revoke_source_sessions()',item);
  END LOOP;
END $$;
CREATE TRIGGER workspace_revoke_sessions AFTER UPDATE OF encrypted_password,email,banned_until,deleted_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.workspace_revoke_source_sessions();

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['workspace_tenants','workspace_principals','workspace_credential_links','workspace_archived_credentials','workspace_console_locations','workspace_auth_sessions','workspace_auth_limits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',item);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',item);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.workspace_sync_principals(),public.workspace_auth_candidate(text),public.workspace_auth_context(uuid),
  public.workspace_auth_reserve(text,text),public.workspace_auth_success(text,text),public.workspace_guard_linked_credentials(),
  public.workspace_revoke_source_sessions(),public.guard_profile_privileges() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_auth_candidate(text),public.workspace_auth_context(uuid),
  public.workspace_auth_reserve(text,text),public.workspace_auth_success(text,text) TO service_role;
-- Retain the already-applied cleaning/cash-out prerequisite, without replaying
-- its historical backfill or modifying the user's migration.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.cleaning_logs,public.cash_outs,public.prep_counts,public.order_sheets FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.locations,public.location_members FROM anon;
NOTIFY pgrst,'reload schema';
COMMIT;
