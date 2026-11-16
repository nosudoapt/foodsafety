-- SEC-01: apply AFTER the historical profile/role/RLS files, in SQL Editor.
-- Optional location_id is compared through JSONB, so a legacy installation
-- without schema-locations.sql is also supported. No historical file is edited.
BEGIN;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'staff';

-- A column REVOKE does not override a table-level UPDATE grant. Use an invoker
-- trigger as well as RLS, so ordinary PostgREST roles cannot change protected
-- fields even if table grants are restored. Trusted SQL/service-role operations
-- and the definer signup trigger may still provision accounts.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS DISTINCT FROM 'staff'
         OR to_jsonb(NEW)->>'trial_ends_at' IS NOT NULL
         OR to_jsonb(NEW)->>'location_id' IS NOT NULL THEN
        RAISE EXCEPTION 'Profile role and access assignments require an administrator' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR (to_jsonb(NEW)->'trial_ends_at') IS DISTINCT FROM (to_jsonb(OLD)->'trial_ends_at')
       OR (to_jsonb(NEW)->'location_id') IS DISTINCT FROM (to_jsonb(OLD)->'location_id') THEN
      RAISE EXCEPTION 'Profile role and access assignments require an administrator' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
CREATE TRIGGER guard_profile_privileges BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();
REVOKE ALL ON FUNCTION public.guard_profile_privileges() FROM PUBLIC;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

COMMIT;
