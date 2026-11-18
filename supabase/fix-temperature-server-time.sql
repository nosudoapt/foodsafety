-- SEC-06: server receipt time is not browser-provided evidence time.
-- Existing timestamps are left untouched; correction timestamps live in audit.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_temperature_timestamps()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.recorded_at:=clock_timestamp();
    NEW.created_at:=NEW.recorded_at;
  ELSIF current_user IN ('anon','authenticated') THEN
    NEW.recorded_at:=OLD.recorded_at;
    NEW.created_at:=OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_temperature_timestamps() FROM PUBLIC;
DROP TRIGGER IF EXISTS guard_temperature_timestamps ON public.temperature_records;
CREATE TRIGGER guard_temperature_timestamps BEFORE INSERT OR UPDATE ON public.temperature_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_temperature_timestamps();
COMMIT;
