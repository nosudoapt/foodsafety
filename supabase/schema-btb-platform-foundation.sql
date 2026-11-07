-- BTB location platform, release 06. Apply AFTER team-operations and uploads.
-- Additive: no guessed location assignments, no seeds, no production row resets.
BEGIN;

ALTER TABLE public.btb_employees DROP CONSTRAINT IF EXISTS btb_employees_role_check;
ALTER TABLE public.btb_employees ADD CONSTRAINT btb_employees_role_check
  CHECK (role IN ('staff','supervisor','manager','designer','corporate','owner'));

CREATE TABLE IF NOT EXISTS public.btb_location_settings (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id),
  active boolean NOT NULL DEFAULT true,
  timezone text, business_day_start time NOT NULL DEFAULT '04:00', report_time time,
  reports_enabled boolean NOT NULL DEFAULT false,
  reminders_enabled boolean NOT NULL DEFAULT false,
  manager_emails text[] NOT NULL DEFAULT '{}', owner_emails text[] NOT NULL DEFAULT '{}',
  additional_emails text[] NOT NULL DEFAULT '{}', compliance_emails text[] NOT NULL DEFAULT '{}',
  reminder_days integer[] NOT NULL DEFAULT '{60,30}',
  compliance_types text[] NOT NULL DEFAULT '{}',
  sales_basis text NOT NULL DEFAULT 'Summary Total Net Sales',
  settings_confirmed boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT reports_enabled OR (timezone IS NOT NULL AND report_time IS NOT NULL AND
    cardinality(manager_emails||owner_emails||additional_emails)>0 AND settings_confirmed))
);
CREATE TABLE IF NOT EXISTS public.btb_location_access (
  location_id uuid NOT NULL REFERENCES public.btb_location_settings(location_id),
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(location_id,employee_id)
);
CREATE INDEX IF NOT EXISTS btb_location_access_employee ON public.btb_location_access(employee_id);

CREATE TABLE IF NOT EXISTS public.btb_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid REFERENCES public.locations(id),
  entity_type text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL,
  actor_id uuid REFERENCES public.btb_employees(id), actor_name text NOT NULL,
  before_data jsonb, after_data jsonb, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_events_record ON public.btb_events(entity_type,entity_id,created_at);
CREATE INDEX IF NOT EXISTS btb_events_location ON public.btb_events(location_id,created_at);

-- Payloads remain server-only and are never included in list responses. This
-- follows the existing DB-backed uploads while separating metadata from reads.
CREATE TABLE IF NOT EXISTS public.btb_file_objects (
  id uuid PRIMARY KEY, location_id uuid NOT NULL REFERENCES public.btb_location_settings(location_id),
  owner_id uuid NOT NULL REFERENCES public.btb_employees(id),
  purpose text NOT NULL CHECK (purpose IN ('reference','artwork','evidence','purchase','sales','compliance','report')),
  name text NOT NULL, mime text NOT NULL CHECK (mime IN ('application/pdf','image/png','image/jpeg','text/csv')),
  byte_size integer NOT NULL CHECK (byte_size>0 AND byte_size<=3145728),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  content_base64 text NOT NULL CHECK (length(content_base64)<=4194304),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_files_location ON public.btb_file_objects(location_id,purpose,created_at);

CREATE TABLE IF NOT EXISTS public.btb_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id uuid NOT NULL REFERENCES public.btb_employees(id),
  location_id uuid REFERENCES public.locations(id), event_id uuid REFERENCES public.btb_events(id),
  dedupe_key text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', href text NOT NULL,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(recipient_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS btb_notifications_inbox ON public.btb_notifications(recipient_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.btb_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE,
  location_id uuid REFERENCES public.locations(id), kind text NOT NULL,
  business_date date, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
  attachment_name text, attachment_base64 text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz, first_attempt_at timestamptz,
  uncertain boolean NOT NULL DEFAULT false, provider_id text, error text, accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status<>'accepted' OR (provider_id IS NOT NULL AND accepted_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS btb_email_due ON public.btb_email_jobs(status,available_at);

CREATE OR REPLACE FUNCTION public.btb_platform_actor(p_actor uuid,p_session integer)
RETURNS public.btb_employees LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees;
BEGIN
  SELECT e.* INTO actor FROM btb_employees e JOIN btb_employee_credentials c ON c.employee_id=e.id
  WHERE e.id=p_actor AND e.active AND e.login_enabled AND c.session_version=p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personal session required' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_assert(p_actor uuid,p_session integer,p_location uuid,p_capability text)
RETURNS public.btb_employees LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees; allowed boolean;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  allowed:=CASE p_capability
    WHEN 'operations.read' THEN actor.role IN ('staff','supervisor','manager','corporate','owner')
    WHEN 'operations.write' THEN actor.role IN ('staff','supervisor','manager','owner')
    WHEN 'operations.configure' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'inventory.read' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'inventory.write' THEN actor.role IN ('manager','owner')
    WHEN 'purchase.upload' THEN actor.role IN ('staff','supervisor','manager','owner')
    WHEN 'marketing.read' THEN actor.role IN ('manager','designer','corporate','owner')
    WHEN 'marketing.request' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'marketing.approve' THEN actor.role IN ('corporate','owner')
    WHEN 'marketing.design' THEN actor.role IN ('designer','owner')
    WHEN 'compliance.read' THEN actor.role IN ('staff','supervisor','manager','corporate','owner')
    WHEN 'compliance.write' THEN actor.role IN ('staff','supervisor','manager','corporate','owner')
    WHEN 'reports' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'settings' THEN actor.role IN ('corporate','owner')
    ELSE false END;
  IF NOT allowed THEN RAISE EXCEPTION 'Role not permitted' USING ERRCODE='42501'; END IF;
  IF p_location IS NULL OR NOT EXISTS(SELECT 1 FROM btb_location_settings WHERE location_id=p_location AND active) THEN
    RAISE EXCEPTION 'Choose an active BTB location' USING ERRCODE='42501'; END IF;
  IF actor.role NOT IN ('corporate','owner') AND NOT (actor.role='designer' AND p_capability LIKE 'marketing.%')
    AND NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_actor AND location_id=p_location) THEN
    RAISE EXCEPTION 'Location not permitted' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION public.btb_event(p_location uuid,p_entity text,p_id uuid,p_action text,p_actor uuid,p_before jsonb,p_after jsonb,p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE event_id uuid;
BEGIN
  INSERT INTO btb_events(location_id,entity_type,entity_id,action,actor_id,actor_name,before_data,after_data,reason)
  SELECT p_location,p_entity,p_id,p_action,p_actor,name,p_before,p_after,p_reason FROM btb_employees WHERE id=p_actor RETURNING id INTO event_id;
  IF event_id IS NULL THEN RAISE EXCEPTION 'Missing audit actor'; END IF;
  RETURN event_id;
END $$;

CREATE OR REPLACE FUNCTION public.btb_notify(p_location uuid,p_roles text[],p_key text,p_title text,p_body text,p_href text,p_event uuid DEFAULT NULL,p_email boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE recipient btb_employees;
BEGIN
  FOR recipient IN SELECT e.* FROM btb_employees e WHERE e.active AND e.login_enabled AND e.role=ANY(p_roles)
    AND (e.role IN ('corporate','owner','designer') OR EXISTS(SELECT 1 FROM btb_location_access a WHERE a.employee_id=e.id AND a.location_id=p_location)) LOOP
    INSERT INTO btb_notifications(recipient_id,location_id,event_id,dedupe_key,title,body,href)
      VALUES(recipient.id,p_location,p_event,p_key,p_title,p_body,p_href) ON CONFLICT DO NOTHING;
    IF p_email AND recipient.email IS NOT NULL THEN
      INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,recipient,subject,body)
        VALUES(p_key||':'||recipient.id,p_location,'notification',recipient.email,p_title,p_body||E'\nOpen your secure BTB workspace: '||p_href) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_bootstrap(p_actor uuid,p_session integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees; sites jsonb;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'timezone',s.timezone,'business_day_start',s.business_day_start,'settings_confirmed',s.settings_confirmed) ORDER BY l.name),'[]') INTO sites
    FROM locations l JOIN btb_location_settings s ON s.location_id=l.id WHERE s.active AND
    (actor.role IN ('corporate','owner','designer') OR EXISTS(SELECT 1 FROM btb_location_access a WHERE a.location_id=l.id AND a.employee_id=p_actor));
  RETURN jsonb_build_object('identity',jsonb_build_object('id',actor.id,'name',actor.name,'role',actor.role),'locations',sites);
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_settings(p_actor uuid,p_session integer,p_location uuid,p_version integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current btb_location_settings; saved btb_location_settings; location uuid; member uuid; v_name text;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  IF actor.role NOT IN ('corporate','owner') THEN RAISE EXCEPTION 'Corporate settings required' USING ERRCODE='42501'; END IF;
  location:=p_location;
  IF location IS NULL THEN
    v_name:=trim(p_data->>'name');
    IF coalesce(v_name,'')='' OR length(v_name)>150 THEN RAISE EXCEPTION 'Location name required'; END IF;
    INSERT INTO locations(name,address) VALUES(v_name,coalesce(p_data->>'address','')) RETURNING id INTO location;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names tz WHERE tz.name=p_data->>'timezone') THEN RAISE EXCEPTION 'Choose an IANA timezone'; END IF;
  SELECT * INTO current FROM btb_location_settings WHERE location_id=location FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Settings changed; reload' USING ERRCODE='40001'; END IF;
  INSERT INTO btb_location_settings(location_id,timezone,business_day_start,report_time,reports_enabled,reminders_enabled,manager_emails,owner_emails,additional_emails,compliance_emails,reminder_days,compliance_types,sales_basis,settings_confirmed,version)
  VALUES(location,p_data->>'timezone',coalesce(p_data->>'business_day_start','04:00')::time,nullif(p_data->>'report_time','')::time,
    coalesce((p_data->>'reports_enabled')::boolean,false),coalesce((p_data->>'reminders_enabled')::boolean,false),ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'manager_emails','[]'))),
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'owner_emails','[]'))),ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'additional_emails','[]'))),
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'compliance_emails','[]'))),ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'reminder_days','[60,30]'))::integer),ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'compliance_types','[]'))),
    coalesce(nullif(p_data->>'sales_basis',''),'Summary Total Net Sales'),coalesce((p_data->>'settings_confirmed')::boolean,false),p_version+1)
  ON CONFLICT(location_id) DO UPDATE SET timezone=excluded.timezone,business_day_start=excluded.business_day_start,report_time=excluded.report_time,
    reports_enabled=excluded.reports_enabled,reminders_enabled=excluded.reminders_enabled,manager_emails=excluded.manager_emails,owner_emails=excluded.owner_emails,additional_emails=excluded.additional_emails,
    compliance_emails=excluded.compliance_emails,reminder_days=excluded.reminder_days,compliance_types=excluded.compliance_types,sales_basis=excluded.sales_basis,settings_confirmed=excluded.settings_confirmed,
    version=excluded.version,updated_at=now() RETURNING * INTO saved;
  IF p_data ? 'members' THEN
    DELETE FROM btb_location_access WHERE location_id=location;
    FOR member IN SELECT jsonb_array_elements_text(p_data->'members')::uuid LOOP
      IF NOT EXISTS(SELECT 1 FROM btb_employees WHERE id=member AND active) THEN RAISE EXCEPTION 'Invalid employee membership'; END IF;
      INSERT INTO btb_location_access(location_id,employee_id) VALUES(location,member);
    END LOOP;
  END IF;
  IF nullif(trim(p_data->>'name'),'') IS NOT NULL THEN UPDATE locations SET name=trim(p_data->>'name'),address=coalesce(p_data->>'address',address) WHERE id=location; END IF;
  PERFORM btb_event(location,'settings',location,'save',p_actor,to_jsonb(current),to_jsonb(saved));
  RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_file_put(p_actor uuid,p_session integer,p_location uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; saved btb_file_objects; purpose text:=p_data->>'purpose';
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,CASE purpose WHEN 'reference' THEN 'marketing.request' WHEN 'artwork' THEN 'marketing.design'
    WHEN 'evidence' THEN 'operations.write' WHEN 'purchase' THEN 'purchase.upload' WHEN 'sales' THEN 'inventory.write' WHEN 'compliance' THEN 'compliance.write' ELSE 'invalid' END);
  INSERT INTO btb_file_objects(id,location_id,owner_id,purpose,name,mime,byte_size,sha256,content_base64)
    VALUES((p_data->>'id')::uuid,p_location,p_actor,purpose,p_data->>'name',p_data->>'mime',(p_data->>'byte_size')::integer,p_data->>'sha256',p_data->>'content_base64') RETURNING * INTO saved;
  PERFORM btb_event(p_location,'file',saved.id,'upload',p_actor,NULL,to_jsonb(saved)-'content_base64');
  RETURN to_jsonb(saved)-'content_base64';
END $$;

-- General outbox: an uncertain response can only be retried inside Resend's
-- idempotency window, with the exact frozen payload and message key.
CREATE OR REPLACE FUNCTION public.btb_claim_email_jobs(p_limit integer DEFAULT 20)
RETURNS SETOF public.btb_email_jobs LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  RETURN QUERY WITH due AS (
    SELECT id FROM btb_email_jobs WHERE status IN ('pending','failed','sending') AND attempts<5 AND available_at<=now()
      AND (lease_until IS NULL OR lease_until<=now()) AND (NOT uncertain OR first_attempt_at>now()-interval '23 hours')
    ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),30)
  ) UPDATE btb_email_jobs j SET status='sending',attempts=j.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',
    first_attempt_at=coalesce(j.first_attempt_at,now()),uncertain=true FROM due WHERE j.id=due.id RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION public.btb_finish_email_job(p_id uuid,p_lease uuid,p_provider text,p_error text,p_uncertain boolean)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  UPDATE btb_email_jobs SET status=CASE WHEN nullif(p_provider,'') IS NOT NULL THEN 'accepted' ELSE 'failed' END,
    provider_id=nullif(p_provider,''),accepted_at=CASE WHEN nullif(p_provider,'') IS NOT NULL THEN now() END,error=p_error,
    uncertain=p_uncertain,lease_until=NULL,lease_token=NULL,available_at=now()+make_interval(mins=>least(60,power(2,attempts)::integer))
    WHERE id=p_id AND lease_token=p_lease AND status='sending';
  RETURN FOUND;
END $$;

DO $$ DECLARE tab text; func record; BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_location_settings','btb_location_access','btb_events','btb_file_objects','btb_notifications','btb_email_jobs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  END LOOP;
  REVOKE UPDATE,DELETE ON public.btb_events,public.btb_file_objects FROM service_role;
  FOR func IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND (p.proname LIKE 'btb_platform_%' OR p.proname IN ('btb_event','btb_notify','btb_claim_email_jobs','btb_finish_email_job')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',func.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',func.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
