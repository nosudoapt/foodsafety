-- SEC-05: classification is derived by PostgreSQL, never the submitted boolean.
-- A missing configured range stays unclassified (NULL), not a safe reading.
-- This does not choose or backfill a new compliance threshold policy.
BEGIN;
CREATE OR REPLACE FUNCTION public.derive_temperature_verdict()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF (NEW.min_safe_temp IS NULL) <> (NEW.max_safe_temp IS NULL)
    OR NEW.min_safe_temp > NEW.max_safe_temp THEN
    RAISE EXCEPTION 'Invalid temperature target range' USING ERRCODE='23514';
  END IF;
  NEW.is_safe:=CASE WHEN NEW.min_safe_temp IS NOT NULL AND NEW.max_safe_temp IS NOT NULL
    THEN NEW.temperature BETWEEN NEW.min_safe_temp AND NEW.max_safe_temp END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.derive_temperature_verdict() FROM PUBLIC;
DROP TRIGGER IF EXISTS derive_temperature_verdict ON public.temperature_records;
CREATE TRIGGER derive_temperature_verdict BEFORE INSERT OR UPDATE ON public.temperature_records
  FOR EACH ROW EXECUTE FUNCTION public.derive_temperature_verdict();
COMMIT;
