-- Step 32: separate BTB console credentials and managed locations.
-- Requires the existing BTB team + location platform releases. No passwords,
-- employees or location memberships are seeded. Written here, NOT applied.
BEGIN;

DO $$ BEGIN
   IF to_regclass('public.btb_employees') IS NULL OR to_regclass('public.btb_location_settings') IS NULL
     OR to_regclass('public.btb_email_jobs') IS NULL OR to_regclass('public.btb_file_objects') IS NULL THEN
    RAISE EXCEPTION 'Install the existing BTB team and location platform releases before steps 32-33' USING ERRCODE='42P01';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.btb_super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email=lower(trim(email))),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  password_hash text NOT NULL CHECK (password_hash ~ '^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$'),
  active boolean NOT NULL DEFAULT true,
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version>0),
  created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.btb_admin_login_limits (
  key text PRIMARY KEY, attempts integer NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.btb_superadmin_locations (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.btb_location_page_access (
  location_id uuid NOT NULL REFERENCES public.locations(id),
  page text NOT NULL CHECK (page ~ '^[a-z][a-z0-9-]*(/[a-z][a-z0-9-]*)*$'),
  allowed boolean NOT NULL DEFAULT false, PRIMARY KEY(location_id,page)
);
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS storage_limit_bytes bigint NOT NULL DEFAULT 52428800 CHECK (storage_limit_bytes>0);
ALTER TABLE public.btb_employees ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Adopt only explicitly configured BTB sites, never the green app's locations.
-- Existing memberships remain intact. Page grants start denied until configured.
INSERT INTO public.btb_superadmin_locations(location_id)
  SELECT location_id FROM public.btb_location_settings ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.btb_admin_session(p_actor uuid,p_session integer)
RETURNS public.btb_super_admins LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE actor btb_super_admins;
BEGIN
  SELECT * INTO actor FROM btb_super_admins WHERE id=p_actor AND active AND session_version=p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'Console session required' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION public.btb_consume_admin_attempt(p_key text)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE count integer;
BEGIN
  IF p_key IS NULL OR length(p_key)>128 THEN RAISE EXCEPTION 'Invalid limiter key' USING ERRCODE='22023'; END IF;
  INSERT INTO btb_admin_login_limits AS limits(key,attempts,window_start) VALUES(p_key,1,now())
  ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN limits.window_start<now()-interval '15 minutes' THEN 1 ELSE limits.attempts+1 END,
    window_start=CASE WHEN limits.window_start<now()-interval '15 minutes' THEN now() ELSE limits.window_start END
  RETURNING attempts INTO count;
  DELETE FROM btb_admin_login_limits WHERE window_start<now()-interval '1 day';
  RETURN count<=10;
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_assert_location(p_actor uuid,p_session integer,p_location uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM btb_admin_session(p_actor,p_session);
  IF NOT EXISTS(SELECT 1 FROM btb_superadmin_locations WHERE location_id=p_location) THEN
    RAISE EXCEPTION 'Location not managed by this console' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_event(p_actor uuid,p_session integer,p_location uuid,p_entity text,p_id uuid,p_action text,p_before jsonb,p_after jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor btb_super_admins;
BEGIN
  actor:=btb_admin_session(p_actor,p_session);
  INSERT INTO btb_events(location_id,entity_type,entity_id,action,actor_name,before_data,after_data)
    VALUES(p_location,p_entity,p_id,p_action,'Console: '||actor.name,p_before,p_after);
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_write_pages(p_location uuid,p_pages jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE page_name text;
BEGIN
  IF p_pages IS NULL OR jsonb_typeof(p_pages)<>'array' OR jsonb_array_length(p_pages)>33 THEN
    RAISE EXCEPTION 'Choose valid workspace pages' USING ERRCODE='22023';
  END IF;
  FOR page_name IN SELECT jsonb_array_elements_text(p_pages) LOOP
    IF page_name IS NULL OR page_name<>ALL(ARRAY[
      'platform','prep-list','checklists','branding-requests','month-end-inventory',
      'training-guide','loyalty-rewards','tax-dates','staff-schedule','employees',
      'cash-out','order-sheet','cleaning-schedule','temperatures','prep-manual','menu',
      'allergen-chart','gluten-free','fryer-timing','emergency','protocols','handbook',
      'manuals','compliance','documents','staff-licenses','licence-reminders','inspections',
      'franchise-inspection','marketing','new-restaurant','vault'
    ]) THEN RAISE EXCEPTION 'Unknown workspace page' USING ERRCODE='22023'; END IF;
  END LOOP;
  DELETE FROM btb_location_page_access WHERE location_id=p_location;
  INSERT INTO btb_location_page_access(location_id,page,allowed)
    SELECT p_location,value,true FROM (SELECT DISTINCT jsonb_array_elements_text(p_pages) AS value) pages;
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_locations(p_actor uuid,p_session integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM btb_admin_session(p_actor,p_session);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'address',l.address,'active',s.active,'timezone',s.timezone,
    'version',s.version,'storage_limit_bytes',s.storage_limit_bytes,'created_at',m.created_at,
    'people',(SELECT count(*) FROM btb_location_access a WHERE a.location_id=l.id),
    'pages',coalesce((SELECT jsonb_agg(page ORDER BY page) FROM btb_location_page_access a WHERE a.location_id=l.id AND a.allowed),'[]'::jsonb)
  ) ORDER BY l.name,l.id),'[]'::jsonb) INTO data
  FROM btb_superadmin_locations m JOIN locations l ON l.id=m.location_id
    JOIN btb_location_settings s ON s.location_id=l.id;
  RETURN jsonb_build_object('locations',data);
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_create_location(p_actor uuid,p_session integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE location uuid; v_name text:=trim(p_data->>'name'); v_timezone text:=p_data->>'timezone';
BEGIN
  PERFORM btb_admin_session(p_actor,p_session);
  IF coalesce(v_name,'')='' OR length(v_name)>150 OR length(coalesce(p_data->>'address',''))>300 THEN
    RAISE EXCEPTION 'Location name or address invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    RAISE EXCEPTION 'Choose an IANA timezone' USING ERRCODE='22023';
  END IF;
  INSERT INTO locations(name,address) VALUES(v_name,coalesce(p_data->>'address','')) RETURNING id INTO location;
  INSERT INTO btb_location_settings(location_id,timezone) VALUES(location,v_timezone);
  INSERT INTO btb_superadmin_locations(location_id) VALUES(location);
  PERFORM btb_admin_write_pages(location,coalesce(p_data->'pages','[]'::jsonb));
  PERFORM btb_admin_event(p_actor,p_session,location,'console_location',location,'create',NULL,jsonb_build_object('name',v_name,'timezone',v_timezone));
  RETURN jsonb_build_object('id',location);
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_update_location(p_actor uuid,p_session integer,p_location uuid,p_version integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE current btb_location_settings; v_name text:=trim(p_data->>'name');
BEGIN
  PERFORM btb_admin_assert_location(p_actor,p_session,p_location);
  SELECT * INTO current FROM btb_location_settings WHERE location_id=p_location FOR UPDATE;
  IF current.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Location changed; reload' USING ERRCODE='40001'; END IF;
  IF coalesce(v_name,'')='' OR length(v_name)>150 OR length(coalesce(p_data->>'address',''))>300
    OR jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Location settings invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_data->>'timezone') THEN
    RAISE EXCEPTION 'Choose an IANA timezone' USING ERRCODE='22023';
  END IF;
  UPDATE locations SET name=v_name,address=coalesce(p_data->>'address',address) WHERE id=p_location;
  UPDATE btb_location_settings SET active=(p_data->>'active')::boolean,timezone=p_data->>'timezone',
    version=version+1,updated_at=now() WHERE location_id=p_location;
  IF p_data ? 'pages' THEN PERFORM btb_admin_write_pages(p_location,p_data->'pages'); END IF;
  PERFORM btb_admin_event(p_actor,p_session,p_location,'console_location',p_location,'update',
    jsonb_build_object('active',current.active,'timezone',current.timezone),p_data);
  RETURN jsonb_build_object('id',p_location,'version',p_version+1);
END $$;

DO $$ DECLARE tab text; f record; BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_super_admins','btb_admin_login_limits','btb_superadmin_locations','btb_location_page_access'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  END LOOP;
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE 'btb_admin_%' OR proname='btb_consume_admin_attempt') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
