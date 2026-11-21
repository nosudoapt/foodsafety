-- Step 41: human-readable location URLs and the hidden demo workspace.
-- Every managed location gets a unique slug (/btb/drumheller). The demo title
-- is not a location: it is configured by BTB_DEMO_SLUG on the server and never
-- appears in the console or the navigation.
BEGIN;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS slug text;

CREATE OR REPLACE FUNCTION public.btb_slugify(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT left(trim(both '-' from regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]+', '-', 'g')), 40);
$$;

DO $$ DECLARE r record; base text; candidate text; n integer; BEGIN
  FOR r IN SELECT id,name FROM locations WHERE slug IS NULL LOOP
    base:=nullif(btb_slugify(r.name),'');
    IF base IS NULL OR base IN ('demo','login','admin','api','btb') THEN base:='location'; END IF;
    candidate:=base; n:=1;
    WHILE EXISTS(SELECT 1 FROM locations WHERE slug=candidate AND id<>r.id) LOOP
      n:=n+1; candidate:=left(base,35)||'-'||n;
    END LOOP;
    UPDATE locations SET slug=candidate WHERE id=r.id;
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS locations_slug_key ON public.locations(slug) WHERE slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.btb_admin_locations(p_actor uuid,p_session integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM btb_admin_session(p_actor,p_session);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'slug',l.slug,'address',l.address,'active',s.active,'timezone',s.timezone,
    'version',s.version,'storage_limit_bytes',s.storage_limit_bytes,'created_at',m.created_at,
    'people',(SELECT count(*) FROM btb_location_access a WHERE a.location_id=l.id),
    'pages',coalesce((SELECT jsonb_agg(page ORDER BY page) FROM btb_location_page_access a WHERE a.location_id=l.id AND a.allowed),'[]'::jsonb)
  ) ORDER BY l.name,l.id),'[]'::jsonb) INTO data
  FROM btb_superadmin_locations m JOIN locations l ON l.id=m.location_id
    JOIN btb_location_settings s ON s.location_id=l.id;
  RETURN jsonb_build_object('locations',data);
END $$;

-- Shared validation: a slug is lowercase ASCII, 1-40 characters, no leading or
-- trailing hyphen, and may never shadow a reserved route.
CREATE OR REPLACE FUNCTION public.btb_location_slug(p_data jsonb,p_name text,p_current uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_slug text;
BEGIN
  v_slug:=nullif(trim(p_data->>'slug'),'');
  IF v_slug IS NULL AND p_current IS NOT NULL THEN SELECT slug INTO v_slug FROM locations WHERE id=p_current; END IF;
  IF v_slug IS NULL THEN v_slug:=nullif(btb_slugify(p_name),''); END IF;
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'
    OR v_slug IN ('demo','login','admin','api','btb') THEN
    RAISE EXCEPTION 'Choose a lowercase URL slug such as drumheller' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM locations WHERE slug=v_slug AND (p_current IS NULL OR id<>p_current)) THEN
    RAISE EXCEPTION 'That location URL is already in use' USING ERRCODE='23505';
  END IF;
  RETURN v_slug;
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_create_location(p_actor uuid,p_session integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE location uuid; v_name text:=trim(p_data->>'name'); v_timezone text:=p_data->>'timezone'; v_slug text;
BEGIN
  PERFORM btb_admin_session(p_actor,p_session);
  IF coalesce(v_name,'')='' OR length(v_name)>150 OR length(coalesce(p_data->>'address',''))>300 THEN
    RAISE EXCEPTION 'Location name or address invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    RAISE EXCEPTION 'Choose an IANA timezone' USING ERRCODE='22023';
  END IF;
  v_slug:=btb_location_slug(p_data,v_name,NULL);
  INSERT INTO locations(name,address,slug) VALUES(v_name,coalesce(p_data->>'address',''),v_slug) RETURNING id INTO location;
  INSERT INTO btb_location_settings(location_id,timezone) VALUES(location,v_timezone);
  INSERT INTO btb_superadmin_locations(location_id) VALUES(location);
  PERFORM btb_admin_write_pages(location,coalesce(p_data->'pages','[]'::jsonb));
  PERFORM btb_admin_event(p_actor,p_session,location,'console_location',location,'create',NULL,jsonb_build_object('name',v_name,'timezone',v_timezone,'slug',v_slug));
  RETURN jsonb_build_object('id',location,'slug',v_slug);
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_update_location(p_actor uuid,p_session integer,p_location uuid,p_version integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE current btb_location_settings; v_name text:=trim(p_data->>'name'); v_slug text;
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
  v_slug:=btb_location_slug(p_data,v_name,p_location);
  UPDATE locations SET name=v_name,address=coalesce(p_data->>'address',address),slug=v_slug WHERE id=p_location;
  UPDATE btb_location_settings SET active=(p_data->>'active')::boolean,timezone=p_data->>'timezone',
    version=version+1,updated_at=now() WHERE location_id=p_location;
  IF p_data ? 'pages' THEN PERFORM btb_admin_write_pages(p_location,p_data->'pages'); END IF;
  PERFORM btb_admin_event(p_actor,p_session,p_location,'console_location',p_location,'update',
    jsonb_build_object('active',current.active,'timezone',current.timezone),p_data);
  RETURN jsonb_build_object('id',p_location,'version',p_version+1,'slug',v_slug);
END $$;

REVOKE ALL ON FUNCTION public.btb_slugify(text),public.btb_location_slug(jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_slugify(text),public.btb_location_slug(jsonb,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
