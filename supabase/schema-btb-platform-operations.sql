-- Release 07: extend existing shift checks / equipment / Celsius records.
BEGIN;
ALTER TABLE public.btb_shift_checks ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.btb_shift_checks ADD COLUMN IF NOT EXISTS scope_key text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.btb_shift_checks DROP CONSTRAINT IF EXISTS btb_shift_checks_restaurant_name_check_date_check_type_key;
ALTER TABLE public.btb_shift_checks DROP CONSTRAINT IF EXISTS btb_shift_checks_check_type_check;
ALTER TABLE public.btb_shift_checks ADD CONSTRAINT btb_shift_checks_check_type_check CHECK (check_type IN ('opening','closing','cleaning'));
CREATE UNIQUE INDEX IF NOT EXISTS btb_checks_scoped ON public.btb_shift_checks(restaurant_name,check_date,check_type,scope_key);

CREATE TABLE IF NOT EXISTS public.btb_operation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES public.btb_location_settings(location_id),
  kind text NOT NULL CHECK(kind IN ('opening','closing','cleaning')), version integer NOT NULL,
  effective_from date NOT NULL, tasks jsonb NOT NULL CHECK(jsonb_typeof(tasks)='array' AND jsonb_array_length(tasks) BETWEEN 1 AND 100),
  created_by uuid NOT NULL REFERENCES public.btb_employees(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id,kind,version)
);

ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS active_from date;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS retired_after date;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS slots text[] NOT NULL DEFAULT '{11:00,16:00,20:00}';
ALTER TABLE public.equipment ALTER COLUMN min_safe_temp DROP NOT NULL;
ALTER TABLE public.equipment ALTER COLUMN max_safe_temp DROP NOT NULL;
ALTER TABLE public.temperature_records ALTER COLUMN min_safe_temp DROP NOT NULL;
ALTER TABLE public.temperature_records ALTER COLUMN max_safe_temp DROP NOT NULL;
ALTER TABLE public.temperature_records ALTER COLUMN is_safe DROP NOT NULL;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES public.equipment(id);
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS slot text;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES public.btb_employees(id);
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS recorded_by_name text;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS btb_temperature_slot ON public.temperature_records(location_id,equipment_id,business_date,slot) WHERE business_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.btb_sanitizer_settings (
  location_id uuid PRIMARY KEY REFERENCES public.btb_location_settings(location_id),
  chemical text NOT NULL DEFAULT '', min_ppm numeric(10,2), max_ppm numeric(10,2),
  slots text[] NOT NULL DEFAULT '{11:00,16:00,20:00}', version integer NOT NULL DEFAULT 1,
  CHECK ((min_ppm IS NULL AND max_ppm IS NULL) OR (min_ppm>=0 AND max_ppm>=min_ppm))
);
CREATE TABLE IF NOT EXISTS public.btb_sanitizer_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES public.btb_location_settings(location_id),
  business_date date NOT NULL, slot text NOT NULL, ppm numeric(10,2) NOT NULL CHECK(ppm>=0),
  unit text NOT NULL DEFAULT 'PPM' CHECK(unit='PPM'), min_ppm numeric(10,2), max_ppm numeric(10,2), is_safe boolean,
  recorded_by uuid NOT NULL REFERENCES public.btb_employees(id), recorded_by_name text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(), notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
  UNIQUE(location_id,business_date,slot)
);

CREATE OR REPLACE FUNCTION public.btb_platform_configure_operations(p_actor uuid,p_session integer,p_location uuid,p_data jsonb,p_profile uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; item jsonb; task jsonb; v integer; v_kind text; equipment_id uuid; effective date; current equipment;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.configure');
  effective:=(p_data->>'effective_from')::date;
  IF effective IS NULL THEN RAISE EXCEPTION 'Effective date required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('operations-config:'||p_location,0));
  IF p_data ? 'tasks' THEN
    v_kind:=p_data->>'kind';
    IF v_kind NOT IN ('opening','closing','cleaning') OR jsonb_array_length(p_data->'tasks') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid task template'; END IF;
    IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_data->'tasks') x)<>jsonb_array_length(p_data->'tasks') THEN RAISE EXCEPTION 'Duplicate task IDs'; END IF;
    FOR task IN SELECT * FROM jsonb_array_elements(p_data->'tasks') LOOP
      IF coalesce(trim(task->>'id'),'')='' OR coalesce(trim(task->>'text'),'')='' THEN RAISE EXCEPTION 'Task name and ID required'; END IF;
      IF nullif(task->>'assigned_to','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_location_access WHERE location_id=p_location AND employee_id=(task->>'assigned_to')::uuid) THEN RAISE EXCEPTION 'Assigned staff must belong to this location'; END IF;
    END LOOP;
    SELECT coalesce(max(version),0)+1 INTO v FROM btb_operation_templates WHERE location_id=p_location AND kind=v_kind;
    INSERT INTO btb_operation_templates(location_id,kind,version,effective_from,tasks,created_by)
      VALUES(p_location,v_kind,v,effective,p_data->'tasks',p_actor);
    PERFORM btb_notify(p_location,ARRAY['staff','supervisor'],'tasks:'||p_location||':'||v_kind||':'||v,'Updated '||v_kind||' duties','Review your assigned location duties.','/between-the-buns/platform?module=operations',NULL,false);
  END IF;
  IF p_data ? 'equipment' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_data->'equipment') LOOP
      equipment_id:=nullif(item->>'id','')::uuid;
      IF coalesce(trim(item->>'name'),'')='' THEN RAISE EXCEPTION 'Equipment name required'; END IF;
      IF (item->>'min') IS NOT NULL AND ((item->>'max') IS NULL OR (item->>'min')::numeric>(item->>'max')::numeric) THEN RAISE EXCEPTION 'Invalid Celsius limits'; END IF;
      IF equipment_id IS NULL THEN
        INSERT INTO equipment(user_id,restaurant_name,name,type,min_safe_temp,max_safe_temp,location_id,active_from)
        VALUES(p_profile,'Between the Buns',item->>'name',coalesce(item->>'type','cold_storage'),(item->>'min')::numeric,(item->>'max')::numeric,p_location,effective);
      ELSE
        SELECT * INTO current FROM equipment WHERE id=equipment_id AND location_id=p_location FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not in location' USING ERRCODE='42501'; END IF;
        UPDATE equipment SET name=item->>'name',min_safe_temp=(item->>'min')::numeric,max_safe_temp=(item->>'max')::numeric,
          retired_after=nullif(item->>'retired_after','')::date WHERE id=equipment_id;
      END IF;
    END LOOP;
  END IF;
  IF p_data ? 'sanitizer' THEN
    IF actor.role NOT IN ('corporate','owner') THEN RAISE EXCEPTION 'Corporate must confirm sanitizer standards' USING ERRCODE='42501'; END IF;
    INSERT INTO btb_sanitizer_settings(location_id,chemical,min_ppm,max_ppm) VALUES(p_location,p_data->'sanitizer'->>'chemical',(p_data->'sanitizer'->>'min')::numeric,(p_data->'sanitizer'->>'max')::numeric)
    ON CONFLICT(location_id) DO UPDATE SET chemical=excluded.chemical,min_ppm=excluded.min_ppm,max_ppm=excluded.max_ppm,version=btb_sanitizer_settings.version+1;
  END IF;
  PERFORM btb_event(p_location,'operations_config',p_location,'configure',p_actor,NULL,p_data);
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_save_check(p_actor uuid,p_session integer,p_location uuid,p_date date,p_kind text,p_version integer,p_changes jsonb,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current btb_shift_checks; saved btb_shift_checks; items jsonb; change jsonb; item jsonb; idx integer; completed boolean; done integer; total integer; evidence uuid;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.write');
  IF p_date IS NULL OR p_kind NOT IN ('opening','closing','cleaning') THEN RAISE EXCEPTION 'Choose checklist and date'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('check:'||p_location||':'||p_date||':'||p_kind,0));
  SELECT * INTO current FROM btb_shift_checks WHERE location_id=p_location AND check_date=p_date AND check_type=p_kind FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Checklist changed; reload' USING ERRCODE='40001'; END IF;
  IF current.id IS NOT NULL THEN items:=current.items;
  ELSE SELECT tasks INTO items FROM btb_operation_templates WHERE location_id=p_location AND kind=p_kind AND effective_from<=p_date ORDER BY effective_from DESC,version DESC LIMIT 1; END IF;
  IF items IS NULL THEN RAISE EXCEPTION 'Manager must configure this checklist first'; END IF;
  IF (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(p_changes) c)<>jsonb_array_length(p_changes) THEN RAISE EXCEPTION 'Duplicate task changes'; END IF;
  FOR change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    SELECT value,ordinality::integer-1 INTO item,idx FROM jsonb_array_elements(items) WITH ORDINALITY WHERE value->>'id'=change->>'id';
    IF item IS NULL THEN RAISE EXCEPTION 'Unknown task'; END IF;
    IF nullif(item->>'assigned_to','') IS NOT NULL AND (item->>'assigned_to')::uuid<>p_actor AND actor.role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Task assigned to another employee' USING ERRCODE='42501'; END IF;
    completed:=coalesce((change->>'completed')::boolean,false); evidence:=nullif(change->>'evidence_id','')::uuid;
    IF evidence IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_file_objects WHERE id=evidence AND location_id=p_location AND purpose='evidence') THEN RAISE EXCEPTION 'Invalid task evidence'; END IF;
    IF completed AND coalesce((item->>'requires_photo')::boolean,false) AND evidence IS NULL THEN RAISE EXCEPTION 'Photo evidence required'; END IF;
    IF completed AND coalesce((item->>'requires_value')::boolean,false) AND coalesce(trim(change->>'value'),'')='' THEN RAISE EXCEPTION 'Task value required'; END IF;
    items:=jsonb_set(items,ARRAY[idx::text],item||jsonb_build_object('completed',completed,'value',change->>'value','notes',coalesce(change->>'notes',''),
      'evidence_id',evidence,'completed_by',CASE WHEN completed THEN p_actor END,'completed_by_name',CASE WHEN completed THEN actor.name END,'completed_at',CASE WHEN completed THEN now() END));
  END LOOP;
  total:=jsonb_array_length(items); SELECT count(*) INTO done FROM jsonb_array_elements(items) x WHERE (x->>'completed')::boolean;
  INSERT INTO btb_shift_checks(location_id,scope_key,check_date,check_type,items,done_count,total_count,completed,notes,saved_by,saved_by_name,version)
  VALUES(p_location,p_location::text,p_date,p_kind,items,done,total,done=total AND total>0,p_notes,p_actor,actor.name,p_version+1)
  ON CONFLICT(restaurant_name,check_date,check_type,scope_key) DO UPDATE SET items=excluded.items,done_count=excluded.done_count,total_count=excluded.total_count,completed=excluded.completed,
    notes=excluded.notes,saved_by=excluded.saved_by,saved_by_name=excluded.saved_by_name,version=excluded.version,updated_at=now() RETURNING * INTO saved;
  INSERT INTO btb_check_revisions(sheet_id,version,items,notes,saved_by,saved_by_name) VALUES(saved.id,saved.version,items,p_notes,p_actor,actor.name);
  PERFORM btb_event(p_location,'checklist',saved.id,'save',p_actor,to_jsonb(current),to_jsonb(saved));
  RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_save_reading(p_actor uuid,p_session integer,p_location uuid,p_profile uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; eq equipment; settings btb_sanitizer_settings; before jsonb; saved jsonb; d date; s text; v integer; reading numeric; record_id uuid;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.write');
  d:=(p_data->>'date')::date; s:=p_data->>'slot'; v:=(p_data->>'version')::integer; reading:=(p_data->>'value')::numeric;
  IF reading IS NULL OR d IS NULL OR v IS NULL OR s NOT IN ('11:00','16:00','20:00') THEN RAISE EXCEPTION 'A date, scheduled slot and numeric reading are required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reading:'||p_location||':'||d||':'||s||':'||coalesce(p_data->>'equipment_id','sanitizer'),0));
  IF p_data->>'kind'='temperature' THEN
    SELECT * INTO eq FROM equipment WHERE id=(p_data->>'equipment_id')::uuid AND location_id=p_location AND active_from<=d AND (retired_after IS NULL OR retired_after>=d);
    IF NOT FOUND OR NOT s=ANY(eq.slots) THEN RAISE EXCEPTION 'Equipment or time not configured'; END IF;
    IF reading < -273.15 OR reading>999.99 THEN RAISE EXCEPTION 'Invalid Celsius reading'; END IF;
    SELECT to_jsonb(t) INTO before FROM temperature_records t WHERE location_id=p_location AND equipment_id=eq.id AND business_date=d AND slot=s FOR UPDATE;
    IF coalesce((before->>'version')::integer,0)<>v THEN RAISE EXCEPTION 'Reading changed; reload' USING ERRCODE='40001'; END IF;
    INSERT INTO temperature_records(user_id,restaurant_name,location_id,equipment_id,equipment_name,record_type,food_item,temperature,unit,min_safe_temp,max_safe_temp,is_safe,business_date,slot,recorded_by,recorded_by_name,notes,version)
    VALUES(p_profile,'Between the Buns',p_location,eq.id,eq.name,'cold_storage',eq.name,reading,'C',eq.min_safe_temp,eq.max_safe_temp,
      CASE WHEN eq.min_safe_temp IS NOT NULL AND eq.max_safe_temp IS NOT NULL THEN reading BETWEEN eq.min_safe_temp AND eq.max_safe_temp END,d,s,p_actor,actor.name,coalesce(p_data->>'notes',''),v+1)
    ON CONFLICT(location_id,equipment_id,business_date,slot) WHERE business_date IS NOT NULL DO UPDATE SET temperature=excluded.temperature,min_safe_temp=excluded.min_safe_temp,max_safe_temp=excluded.max_safe_temp,
      is_safe=excluded.is_safe,recorded_by=excluded.recorded_by,recorded_by_name=excluded.recorded_by_name,notes=excluded.notes,version=excluded.version,recorded_at=now() RETURNING to_jsonb(temperature_records),id INTO saved,record_id;
  ELSIF p_data->>'kind'='sanitizer' THEN
    IF reading<0 OR reading>99999999 THEN RAISE EXCEPTION 'Invalid PPM reading'; END IF;
    SELECT * INTO settings FROM btb_sanitizer_settings WHERE location_id=p_location;
    SELECT to_jsonb(t) INTO before FROM btb_sanitizer_logs t WHERE location_id=p_location AND business_date=d AND slot=s FOR UPDATE;
    IF coalesce((before->>'version')::integer,0)<>v THEN RAISE EXCEPTION 'Reading changed; reload' USING ERRCODE='40001'; END IF;
    INSERT INTO btb_sanitizer_logs(location_id,business_date,slot,ppm,min_ppm,max_ppm,is_safe,recorded_by,recorded_by_name,notes,version)
    VALUES(p_location,d,s,reading,settings.min_ppm,settings.max_ppm,CASE WHEN settings.min_ppm IS NOT NULL AND settings.max_ppm IS NOT NULL THEN reading BETWEEN settings.min_ppm AND settings.max_ppm END,p_actor,actor.name,coalesce(p_data->>'notes',''),v+1)
    ON CONFLICT(location_id,business_date,slot) DO UPDATE SET ppm=excluded.ppm,min_ppm=excluded.min_ppm,max_ppm=excluded.max_ppm,is_safe=excluded.is_safe,recorded_by=excluded.recorded_by,recorded_by_name=excluded.recorded_by_name,notes=excluded.notes,version=excluded.version,recorded_at=now()
    RETURNING to_jsonb(btb_sanitizer_logs),id INTO saved,record_id;
  ELSE RAISE EXCEPTION 'Choose Celsius temperature or PPM sanitizer'; END IF;
  PERFORM btb_event(p_location,p_data->>'kind',record_id,'record',p_actor,before,saved);
  RETURN saved;
END $$;

-- Legacy RPC keeps its signature and legacy-only rows after widening uniqueness.
CREATE OR REPLACE FUNCTION public.btb_save_shift_check(p_date date,p_type text,p_version integer,p_items jsonb,p_notes text,p_employee_id uuid,p_actor text)
RETURNS SETOF public.btb_shift_checks LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_shift_checks; saved btb_shift_checks; done integer; total integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-check:'||p_date::text||':'||p_type,0));
  SELECT * INTO current FROM btb_shift_checks WHERE restaurant_name='Between the Buns' AND location_id IS NULL AND check_date=p_date AND check_type=p_type FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Stale checklist' USING ERRCODE='40001'; END IF;
  total:=jsonb_array_length(p_items); SELECT count(*) INTO done FROM jsonb_array_elements(p_items) item WHERE (item->>'completed')::boolean;
  INSERT INTO btb_shift_checks(check_date,check_type,items,notes,done_count,total_count,completed,saved_by,saved_by_name,version)
  VALUES(p_date,p_type,p_items,p_notes,done,total,done=total AND total>0,p_employee_id,p_actor,p_version+1)
  ON CONFLICT(restaurant_name,check_date,check_type,scope_key) DO UPDATE SET items=excluded.items,notes=excluded.notes,done_count=excluded.done_count,total_count=excluded.total_count,
    completed=excluded.completed,saved_by=excluded.saved_by,saved_by_name=excluded.saved_by_name,version=excluded.version,updated_at=now() RETURNING * INTO saved;
  INSERT INTO btb_check_revisions(sheet_id,version,items,notes,saved_by,saved_by_name) VALUES(saved.id,saved.version,saved.items,saved.notes,p_employee_id,p_actor);
  RETURN NEXT saved;
END $$;

DO $$ DECLARE tab text; f record; BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_operation_templates','btb_sanitizer_settings','btb_sanitizer_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',tab); EXECUTE format('GRANT ALL ON %I TO service_role',tab);
  END LOOP;
  GRANT ALL ON equipment,temperature_records TO service_role;
  -- Restrictive boundary supplements rather than replaces FoodSafe ownership RLS.
  ALTER TABLE equipment ENABLE ROW LEVEL SECURITY; ALTER TABLE temperature_records ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS btb_location_private ON equipment;
  CREATE POLICY btb_location_private ON equipment AS RESTRICTIVE TO anon,authenticated USING(location_id IS NULL OR restaurant_name<>'Between the Buns') WITH CHECK(location_id IS NULL OR restaurant_name<>'Between the Buns');
  DROP POLICY IF EXISTS btb_location_private ON temperature_records;
  CREATE POLICY btb_location_private ON temperature_records AS RESTRICTIVE TO anon,authenticated USING(business_date IS NULL) WITH CHECK(business_date IS NULL);
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'btb_platform_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
