-- HTTP-10 / HTTP-14: one transactional, append-once write for the whole sheet.
-- Apply after the historical schemas. Duplicate live boxes must be reconciled
-- by an operator first: this migration never deletes/deduplicates evidence.
BEGIN;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS slot text;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS recorded_by_name text;
CREATE UNIQUE INDEX IF NOT EXISTS btb_legacy_temperature_box
  ON public.temperature_records(restaurant_name,user_id,business_date,equipment_name,slot)
  WHERE location_id IS NULL AND business_date IS NOT NULL;
DROP POLICY IF EXISTS btb_legacy_sheet_private ON public.temperature_records;
CREATE POLICY btb_legacy_sheet_private ON public.temperature_records AS RESTRICTIVE TO anon,authenticated
  USING(restaurant_name<>'Between the Buns' OR business_date IS NULL)
  WITH CHECK(restaurant_name<>'Between the Buns' OR business_date IS NULL);

CREATE OR REPLACE FUNCTION public.btb_save_temperature_sheet(p_owner uuid,p_date date,p_cells jsonb,p_actor text)
RETURNS SETOF public.temperature_records LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE cell jsonb; previous temperature_records; low numeric; high numeric; reading numeric; units text; label text; slot_ text;
BEGIN
  IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_owner AND restaurant_name='Between the Buns') THEN
    RAISE EXCEPTION 'Temperature storage not configured' USING ERRCODE='42501';
  END IF;
  IF p_date IS NULL OR p_date>(clock_timestamp() AT TIME ZONE 'America/Regina')::date THEN
    RAISE EXCEPTION 'Choose a non-future sheet date' USING ERRCODE='22023';
  END IF;
  IF p_cells IS NULL OR jsonb_typeof(p_cells)<>'array' OR jsonb_array_length(p_cells) NOT BETWEEN 1 AND 42
    OR coalesce(length(trim(p_actor)),0) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'Invalid sheet' USING ERRCODE='22023'; END IF;
  IF (SELECT count(DISTINCT (x->>'label',x->>'slot')) FROM jsonb_array_elements(p_cells) x)<>jsonb_array_length(p_cells) THEN
    RAISE EXCEPTION 'Duplicate sheet box' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('legacy-temperature-sheet:'||p_owner||':'||p_date,0));
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
      AND location_id IS NULL AND business_date=p_date AND equipment_name=label AND slot=slot_ FOR UPDATE;
    IF FOUND THEN
      IF previous.temperature IS DISTINCT FROM reading OR previous.unit IS DISTINCT FROM units
        OR previous.min_safe_temp IS DISTINCT FROM low OR previous.max_safe_temp IS DISTINCT FROM high THEN
        RAISE EXCEPTION 'A sheet box was already saved differently' USING ERRCODE='23505';
      END IF;
    ELSE
      INSERT INTO temperature_records(user_id,restaurant_name,location_id,equipment_name,food_item,record_type,temperature,unit,min_safe_temp,max_safe_temp,is_safe,notes,recorded_by_name,business_date,slot)
      VALUES(p_owner,'Between the Buns',NULL,label,CASE WHEN units='PPM' THEN 'Sanitizer bucket (200–400 PPM standard)' ELSE 'Scheduled equipment check' END,
        'cold_storage',reading,units,low,high,reading BETWEEN low AND high,'Sheet by: '||p_actor||CASE WHEN units='PPM' THEN ' · sanitizer strength in PPM' ELSE '' END,p_actor,p_date,slot_);
    END IF;
  END LOOP;
  RETURN QUERY SELECT t.* FROM temperature_records t WHERE t.restaurant_name='Between the Buns' AND t.user_id=p_owner
    AND t.location_id IS NULL AND t.business_date=p_date AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_cells) c WHERE c->>'label'=t.equipment_name AND c->>'slot'=t.slot)
    ORDER BY t.equipment_name,t.slot;
END $$;
REVOKE ALL ON FUNCTION public.btb_save_temperature_sheet(uuid,date,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_save_temperature_sheet(uuid,date,jsonb,text) TO service_role;
GRANT SELECT,INSERT ON public.temperature_records TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
