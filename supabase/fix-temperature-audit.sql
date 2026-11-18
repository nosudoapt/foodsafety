-- SEC-07: additive, transactional audit of temperature mutations.
-- Apply after the historical temperature schemas. No evidence backfill is
-- invented and no record is rewritten. UPDATE/DELETE remain allowed by the
-- existing ownership policies, but cannot silently erase their prior values.
BEGIN;
CREATE TABLE IF NOT EXISTS public.temperature_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL,
  restaurant_name text NOT NULL,
  record_owner uuid,
  actor_id uuid,
  operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Intentionally no FK to a mutable record, profile or auth user: deletion of
-- any of those must not cascade into the original compliance evidence.
CREATE INDEX IF NOT EXISTS temperature_record_events_record ON public.temperature_record_events(record_id,created_at);
ALTER TABLE public.temperature_record_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.temperature_record_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.temperature_record_events TO authenticated,service_role;
DROP POLICY IF EXISTS temperature_events_own_read ON public.temperature_record_events;
CREATE POLICY temperature_events_own_read ON public.temperature_record_events FOR SELECT TO authenticated USING(record_owner=auth.uid());
DROP POLICY IF EXISTS temperature_events_read_boundary ON public.temperature_record_events;
CREATE POLICY temperature_events_read_boundary ON public.temperature_record_events AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(record_owner=auth.uid());

CREATE OR REPLACE FUNCTION public.audit_temperature_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.temperature_record_events(record_id,restaurant_name,record_owner,actor_id,operation,before_data,after_data)
  VALUES(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP='DELETE' THEN OLD.restaurant_name ELSE NEW.restaurant_name END,
    CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END,
    auth.uid(),TG_OP,
    CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_temperature_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS audit_temperature_mutation ON public.temperature_records;
CREATE TRIGGER audit_temperature_mutation AFTER INSERT OR UPDATE OR DELETE ON public.temperature_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_temperature_mutation();

CREATE OR REPLACE FUNCTION public.guard_temperature_event_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Temperature audit history is append-only' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.guard_temperature_event_changes() FROM PUBLIC;
DROP TRIGGER IF EXISTS guard_temperature_event_changes ON public.temperature_record_events;
CREATE TRIGGER guard_temperature_event_changes BEFORE UPDATE OR DELETE ON public.temperature_record_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_temperature_event_changes();
DROP POLICY IF EXISTS temperature_events_insert_boundary ON public.temperature_record_events;
CREATE POLICY temperature_events_insert_boundary ON public.temperature_record_events AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
COMMIT;
