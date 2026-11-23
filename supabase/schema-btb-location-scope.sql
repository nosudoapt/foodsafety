-- Release 09: every operational record belongs to exactly one branch.
--
-- Until now the legacy daily tools (temperature log/sheet, opening & closing
-- checklists, order sheet, staff schedule) were keyed only by restaurant, so a
-- signed-in employee of one branch could read and change another branch's rows.
-- `location_id IS NULL` stays the demo/legacy tenant: the shared workspace and
-- the owner's aggregate view keep working exactly as before.
BEGIN;

-- 1. Temperature standards become per branch ------------------------------
ALTER TABLE public.btb_temperature_standards ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

-- The eight standards already approved for the live branch belong to it. Any
-- other pre-existing row stays with the legacy/demo tenant rather than being
-- guessed into a branch.
UPDATE public.btb_temperature_standards s
   SET location_id = l.id
  FROM public.locations l
 WHERE s.location_id IS NULL AND l.slug = 'drumheller';

ALTER TABLE public.btb_temperature_standards DROP CONSTRAINT IF EXISTS btb_temperature_standards_restaurant_name_record_type_equip_key;
DROP INDEX IF EXISTS public.btb_temperature_standards_restaurant_name_record_type_equip_key;
CREATE UNIQUE INDEX IF NOT EXISTS btb_temperature_standards_legacy_key
  ON public.btb_temperature_standards(restaurant_name, record_type, equipment_name) WHERE location_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS btb_temperature_standards_location_key
  ON public.btb_temperature_standards(location_id, record_type, equipment_name) WHERE location_id IS NOT NULL;

-- 2. Order sheets become per branch --------------------------------------
ALTER TABLE public.btb_order_sheets ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.btb_order_sheets DROP CONSTRAINT IF EXISTS btb_order_sheets_restaurant_name_order_date_key;
DROP INDEX IF EXISTS public.btb_order_sheets_restaurant_name_order_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS btb_order_sheets_legacy_key
  ON public.btb_order_sheets(restaurant_name, order_date) WHERE location_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS btb_order_sheets_location_key
  ON public.btb_order_sheets(location_id, order_date) WHERE location_id IS NOT NULL;

-- 3. Fast lookup for the per-branch reads ---------------------------------
CREATE INDEX IF NOT EXISTS btb_order_sheets_location_date ON public.btb_order_sheets(location_id, order_date DESC);
CREATE INDEX IF NOT EXISTS btb_shift_checks_location_date ON public.btb_shift_checks(location_id, check_date DESC);
CREATE INDEX IF NOT EXISTS btb_temperature_standards_location ON public.btb_temperature_standards(location_id);

COMMIT;
-- 4. Location-aware writers ----------------------------------------------
-- Each keeps the legacy function's behaviour and adds one tenant parameter.
-- The demo/aggregate tenant passes NULL and keeps writing unowned rows.

CREATE OR REPLACE FUNCTION public.btb_save_shift_scoped(
  p_id uuid, p_version integer, p_employee_id uuid, p_date date, p_start text, p_end text,
  p_next_day boolean, p_duty text, p_actor text, p_location uuid)
RETURNS SETOF public.btb_shifts LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_shifts; saved btb_shifts; start_at timestamp; end_at timestamp;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-schedule:'||coalesce(p_location::text,'legacy'),0));
  IF NOT EXISTS(SELECT 1 FROM btb_employees WHERE id=p_employee_id AND active) THEN RAISE EXCEPTION 'Employee is inactive'; END IF;
  -- An individual employee may only be scheduled by a branch they belong to.
  IF p_location IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_employee_id AND location_id=p_location) THEN
    RAISE EXCEPTION 'This employee is not assigned to this branch' USING ERRCODE='42501'; END IF;
  IF p_location IS NULL AND EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_employee_id) THEN
    RAISE EXCEPTION 'Use the location schedule for this employee' USING ERRCODE='42501'; END IF;
  SELECT * INTO current FROM btb_shifts WHERE id=p_id FOR UPDATE;
  IF current.id IS NOT NULL AND current.location_id IS DISTINCT FROM p_location THEN
    RAISE EXCEPTION 'That shift belongs to another branch' USING ERRCODE='42501'; END IF;
  IF coalesce(current.version,0)<>p_version OR (p_id IS NOT NULL AND current.id IS NULL) THEN RAISE EXCEPTION 'Stale shift' USING ERRCODE='40001'; END IF;
  start_at:=p_date+p_start::time; end_at:=p_date+p_end::time+CASE WHEN p_next_day THEN interval '1 day' ELSE interval '0' END;
  IF end_at<=start_at OR end_at-start_at>interval '1 day' THEN RAISE EXCEPTION 'Invalid shift times'; END IF;
  IF EXISTS(SELECT 1 FROM btb_shifts WHERE employee_id=p_employee_id AND id IS DISTINCT FROM p_id AND cancelled_at IS NULL
    AND shift_date+start_time::time<end_at AND shift_date+end_time::time+CASE WHEN ends_next_day THEN interval '1 day' ELSE interval '0' END>start_at) THEN RAISE EXCEPTION 'Overlapping shift' USING ERRCODE='23P01'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO btb_shifts(employee_id,shift_date,start_time,end_time,ends_next_day,duty,updated_by_name,location_id)
      VALUES(p_employee_id,p_date,p_start,p_end,p_next_day,p_duty,p_actor,p_location) RETURNING * INTO saved;
  ELSE
    UPDATE btb_shifts SET employee_id=p_employee_id,shift_date=p_date,start_time=p_start,end_time=p_end,ends_next_day=p_next_day,
      duty=p_duty,updated_by_name=p_actor,updated_at=now(),version=version+1,location_id=p_location WHERE id=p_id RETURNING * INTO saved;
  END IF;
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_shift_check_scoped(
  p_date date, p_type text, p_version integer, p_items jsonb, p_notes text,
  p_employee_id uuid, p_actor text, p_location uuid)
RETURNS SETOF public.btb_shift_checks LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_shift_checks; saved btb_shift_checks; done integer; total integer; scope text;
BEGIN
  scope:=coalesce(p_location::text,'legacy');
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-check:'||scope||':'||p_date::text||':'||p_type,0));
  SELECT * INTO current FROM btb_shift_checks
   WHERE restaurant_name='Between the Buns' AND location_id IS NOT DISTINCT FROM p_location
     AND check_date=p_date AND check_type=p_type FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Stale checklist' USING ERRCODE='40001'; END IF;
  total:=jsonb_array_length(p_items);
  SELECT count(*) INTO done FROM jsonb_array_elements(p_items) item WHERE (item->>'completed')::boolean;
  INSERT INTO btb_shift_checks(location_id,scope_key,check_date,check_type,items,notes,done_count,total_count,completed,saved_by,saved_by_name,version)
  VALUES(p_location,scope,p_date,p_type,p_items,p_notes,done,total,done=total AND total>0,p_employee_id,p_actor,p_version+1)
  ON CONFLICT(restaurant_name,check_date,check_type,scope_key) DO UPDATE SET items=excluded.items,notes=excluded.notes,
    done_count=excluded.done_count,total_count=excluded.total_count,completed=excluded.completed,
    saved_by=excluded.saved_by,saved_by_name=excluded.saved_by_name,version=excluded.version,updated_at=now() RETURNING * INTO saved;
  INSERT INTO btb_check_revisions(sheet_id,version,items,notes,saved_by,saved_by_name)
    VALUES(saved.id,saved.version,saved.items,saved.notes,p_employee_id,p_actor);
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_order_scoped(
  p_date date, p_lines jsonb, p_version integer, p_employee_id uuid, p_actor text, p_location uuid)
RETURNS SETOF public.btb_order_sheets LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_order_sheets; saved btb_order_sheets;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-order:'||coalesce(p_location::text,'legacy')||':'||p_date::text,0));
  SELECT * INTO current FROM btb_order_sheets
   WHERE restaurant_name='Between the Buns' AND location_id IS NOT DISTINCT FROM p_location AND order_date=p_date FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Stale order' USING ERRCODE='40001'; END IF;
  IF current.id IS NULL THEN
    INSERT INTO btb_order_sheets(order_date,lines,version,saved_by,saved_by_name,location_id)
      VALUES(p_date,p_lines,p_version+1,p_employee_id,p_actor,p_location) RETURNING * INTO saved;
  ELSE
    UPDATE btb_order_sheets SET lines=p_lines,version=p_version+1,saved_by=p_employee_id,saved_by_name=p_actor,saved_at=now()
     WHERE id=current.id RETURNING * INTO saved;
  END IF;
  INSERT INTO btb_order_revisions(sheet_id,order_date,lines,version,saved_by_name)
    VALUES(saved.id,p_date,p_lines,saved.version,p_actor);
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_temperature_sheet_scoped(
  p_owner uuid, p_date date, p_cells jsonb, p_actor text, p_location uuid)
RETURNS SETOF public.temperature_records LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE cell jsonb; previous temperature_records; low numeric; high numeric; reading numeric; units text; label text; slot_ text;
BEGIN
  IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_owner AND restaurant_name='Between the Buns') THEN
    RAISE EXCEPTION 'Temperature storage not configured' USING ERRCODE='42501';
  END IF;
  IF p_location IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locations WHERE id=p_location) THEN
    RAISE EXCEPTION 'Unknown branch' USING ERRCODE='22023';
  END IF;
  IF p_date IS NULL OR p_date>(clock_timestamp() AT TIME ZONE 'America/Regina')::date THEN
    RAISE EXCEPTION 'Choose a non-future sheet date' USING ERRCODE='22023';
  END IF;
  IF p_cells IS NULL OR jsonb_typeof(p_cells)<>'array' OR jsonb_array_length(p_cells) NOT BETWEEN 1 AND 42
    OR coalesce(length(trim(p_actor)),0) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'Invalid sheet' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(DISTINCT (x->>'label',x->>'slot')) FROM jsonb_array_elements(p_cells) x)<>jsonb_array_length(p_cells) THEN
    RAISE EXCEPTION 'Duplicate sheet box' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('temperature-sheet:'||coalesce(p_location::text,'legacy')||':'||p_owner||':'||p_date,0));
  FOR cell IN SELECT x FROM jsonb_array_elements(p_cells) x ORDER BY x->>'label',x->>'slot' LOOP
    label:=cell->>'label'; slot_:=cell->>'slot'; reading:=(cell->>'value')::numeric;
    IF label IS NULL OR slot_ IS NULL OR slot_ NOT IN ('11:00','16:00','20:00') THEN RAISE EXCEPTION 'Invalid sheet box' USING ERRCODE='22023'; END IF;
    units:='C'; low:=-273.15;
    IF label IN ('FREEZER-1','FREEZER-2','FREEZER-3','FREEZER-4','FREEZER-5') THEN high:=-12;
    ELSIF label IN ('COOLER-1','COOLER-2','COOLER-3','LINE COOLER','CHEF BASE DRAWER') THEN high:=4;
    ELSIF label='SANTIZER' THEN units:='PPM'; low:=200; high:=400;
    ELSE RAISE EXCEPTION 'Invalid sheet row' USING ERRCODE='22023'; END IF;
    IF reading IS NULL OR reading<(CASE WHEN units='PPM' THEN 0 ELSE -273.15 END) OR reading>999.99 OR reading<>round(reading,2) THEN
      RAISE EXCEPTION 'Invalid sheet value' USING ERRCODE='22023';
    END IF;
    SELECT * INTO previous FROM temperature_records WHERE restaurant_name='Between the Buns' AND user_id=p_owner
      AND location_id IS NOT DISTINCT FROM p_location AND business_date=p_date AND equipment_name=label AND slot=slot_ FOR UPDATE;
    IF FOUND THEN
      IF previous.temperature IS DISTINCT FROM reading OR previous.unit IS DISTINCT FROM units
        OR previous.min_safe_temp IS DISTINCT FROM low OR previous.max_safe_temp IS DISTINCT FROM high THEN
        RAISE EXCEPTION 'A sheet box was already saved differently' USING ERRCODE='23505';
      END IF;
    ELSE
      INSERT INTO temperature_records(user_id,restaurant_name,location_id,equipment_name,food_item,record_type,temperature,unit,min_safe_temp,max_safe_temp,is_safe,notes,recorded_by_name,business_date,slot)
      VALUES(p_owner,'Between the Buns',p_location,label,CASE WHEN units='PPM' THEN 'Sanitizer bucket (200–400 PPM standard)' ELSE 'Scheduled equipment check' END,
        'cold_storage',reading,units,low,high,reading BETWEEN low AND high,'Sheet by: '||p_actor||CASE WHEN units='PPM' THEN ' · sanitizer strength in PPM' ELSE '' END,p_actor,p_date,slot_);
    END IF;
  END LOOP;
  RETURN QUERY SELECT t.* FROM temperature_records t WHERE t.restaurant_name='Between the Buns' AND t.user_id=p_owner
    AND t.location_id IS NOT DISTINCT FROM p_location AND t.business_date=p_date
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_cells) c WHERE c->>'label'=t.equipment_name AND c->>'slot'=t.slot)
    ORDER BY t.equipment_name,t.slot;
END $$;

-- Only the backend may call these: they take an explicit tenant id.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('btb_save_shift_scoped','btb_save_shift_check_scoped','btb_save_order_scoped','btb_save_temperature_sheet_scoped') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

