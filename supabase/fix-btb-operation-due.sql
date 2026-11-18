-- DB-05 / DB-06: evidence cannot complete a future business day or time slot.
-- Location timezone and business-day start are operator configuration, not
-- browser wall time. Historical corrections remain allowed and audited.
BEGIN;
CREATE OR REPLACE FUNCTION public.btb_operation_is_due(p_location uuid,p_date date,p_slot time DEFAULT NULL,p_now timestamptz DEFAULT clock_timestamp())
RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT coalesce((SELECT p_date IS NOT NULL AND s.timezone IS NOT NULL
    AND p_date<=((p_now AT TIME ZONE s.timezone)-s.business_day_start::interval)::date
    AND (p_slot IS NULL OR p_now>=((p_date+p_slot+
      CASE WHEN p_slot<s.business_day_start THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE s.timezone))
    FROM btb_location_settings s WHERE s.location_id=p_location),false);
$$;
REVOKE ALL ON FUNCTION public.btb_operation_is_due(uuid,date,time,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_operation_is_due(uuid,date,time,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.btb_guard_operation_due()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE due_date date; due_slot time;
BEGIN
  IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='btb_shift_checks' THEN
    IF NOT coalesce(NEW.completed,false) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.items) item WHERE coalesce((item->>'completed')::boolean,false)) THEN
      RETURN NEW; -- Future incomplete drafts are not completion evidence.
    END IF;
    due_date:=NEW.check_date;
  ELSE
    due_date:=NEW.business_date; due_slot:=NEW.slot::time;
  END IF;
  IF NOT btb_operation_is_due(NEW.location_id,due_date,due_slot,clock_timestamp()) THEN
    RAISE EXCEPTION 'This scheduled operation is not due yet; check the date, time and configured timezone' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.btb_guard_operation_due() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS btb_guard_operation_due ON public.btb_shift_checks;
CREATE TRIGGER btb_guard_operation_due BEFORE INSERT OR UPDATE ON public.btb_shift_checks FOR EACH ROW EXECUTE FUNCTION public.btb_guard_operation_due();
DROP TRIGGER IF EXISTS btb_guard_operation_due ON public.temperature_records;
CREATE TRIGGER btb_guard_operation_due BEFORE INSERT OR UPDATE ON public.temperature_records FOR EACH ROW EXECUTE FUNCTION public.btb_guard_operation_due();
DROP TRIGGER IF EXISTS btb_guard_operation_due ON public.btb_sanitizer_logs;
CREATE TRIGGER btb_guard_operation_due BEFORE INSERT OR UPDATE ON public.btb_sanitizer_logs FOR EACH ROW EXECUTE FUNCTION public.btb_guard_operation_due();
NOTIFY pgrst,'reload schema';
COMMIT;
