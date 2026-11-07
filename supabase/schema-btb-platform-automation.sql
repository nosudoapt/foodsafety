-- Release 10: compliance history, combined daily reports, durable schedules.
BEGIN;
ALTER TABLE btb_location_settings ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE btb_email_jobs ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE btb_email_jobs ADD COLUMN IF NOT EXISTS frozen_from text;
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES btb_employees(id);
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS responsible_id uuid REFERENCES btb_employees(id);
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS licence_number text;
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS recipients text[] NOT NULL DEFAULT '{}';
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES btb_file_objects(id);
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS renewal_confirmed_at timestamptz;
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS btb_compliance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES compliance_documents(id),
  version integer NOT NULL, file_id uuid REFERENCES btb_file_objects(id), issue_date date, expiry_date date,
  confirmed_by uuid NOT NULL REFERENCES btb_employees(id), confirmed_by_name text NOT NULL,
  reason text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,version)
);

CREATE OR REPLACE FUNCTION btb_platform_compliance(p_actor uuid,p_session integer,p_location uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current compliance_documents; saved compliance_documents; staff uuid; file uuid; expiry date;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'compliance.write');
  SELECT * INTO current FROM compliance_documents WHERE id=nullif(p_data->>'id','')::uuid AND location_id=p_location FOR UPDATE;
  IF nullif(p_data->>'id','') IS NOT NULL AND current.id IS NULL THEN RAISE EXCEPTION 'Document not in this location' USING ERRCODE='42501'; END IF;
  IF coalesce(current.version,0)<>coalesce((p_data->>'version')::integer,-1) THEN RAISE EXCEPTION 'Document changed; reload' USING ERRCODE='40001'; END IF;
  staff:=nullif(p_data->>'employee_id','')::uuid; file:=nullif(p_data->>'file_id','')::uuid; expiry:=nullif(p_data->>'expiry_date','')::date;
  IF NOT (p_data ? 'file_id') THEN file:=current.file_id; END IF;
  IF actor.role IN ('staff','supervisor') AND (staff IS DISTINCT FROM p_actor OR (current.id IS NOT NULL AND current.employee_id IS DISTINCT FROM p_actor)) THEN RAISE EXCEPTION 'Upload only your own certificate' USING ERRCODE='42501'; END IF;
  IF staff IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_location_access WHERE location_id=p_location AND employee_id=staff) THEN RAISE EXCEPTION 'Certificate holder not assigned to location'; END IF;
  IF file IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_file_objects WHERE id=file AND location_id=p_location AND purpose='compliance' AND (owner_id=p_actor OR actor.role IN ('manager','corporate','owner'))) THEN RAISE EXCEPTION 'Invalid private certificate file'; END IF;
  IF file IS NOT NULL AND (expiry IS NULL OR coalesce((p_data->>'expiry_confirmed')::boolean,false)=false) THEN RAISE EXCEPTION 'Confirm the new expiry date; uploading alone does not renew a certificate'; END IF;
  IF expiry IS DISTINCT FROM current.expiry_date AND expiry IS NOT NULL AND coalesce((p_data->>'expiry_confirmed')::boolean,false)=false THEN RAISE EXCEPTION 'Explicit expiry confirmation required'; END IF;
  IF actor.role IN ('staff','supervisor') AND (jsonb_array_length(coalesce(p_data->'recipients','[]'))>0 OR nullif(p_data->>'responsible_id','') IS NOT NULL) THEN RAISE EXCEPTION 'Management configures reminder recipients' USING ERRCODE='42501'; END IF;
  IF nullif(p_data->>'responsible_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_employees e WHERE e.id=(p_data->>'responsible_id')::uuid AND e.active AND (e.role IN ('corporate','owner') OR EXISTS(SELECT 1 FROM btb_location_access a WHERE a.employee_id=e.id AND a.location_id=p_location))) THEN RAISE EXCEPTION 'Responsible person not assigned to this location'; END IF;
  IF nullif(p_data->>'issue_date','')::date>expiry THEN RAISE EXCEPTION 'Issue date must precede expiry'; END IF;
  IF current.id IS NOT NULL AND coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Renewal or correction reason required'; END IF;
  INSERT INTO compliance_documents(id,restaurant_name,location_id,doc_type,name,employee_id,responsible_id,licence_number,recipients,file_id,issue_date,expiry_date,notes,version,renewal_confirmed_at)
  VALUES(coalesce(current.id,gen_random_uuid()),'Between the Buns',p_location,p_data->>'doc_type',p_data->>'name',staff,nullif(p_data->>'responsible_id','')::uuid,p_data->>'licence_number',
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'recipients','[]'))),file,nullif(p_data->>'issue_date','')::date,expiry,coalesce(p_data->>'notes',''),coalesce(current.version,0)+1,CASE WHEN current.id IS NOT NULL AND expiry IS DISTINCT FROM current.expiry_date THEN now() END)
  ON CONFLICT(id) DO UPDATE SET doc_type=excluded.doc_type,name=excluded.name,employee_id=excluded.employee_id,responsible_id=excluded.responsible_id,licence_number=excluded.licence_number,recipients=excluded.recipients,
    file_id=excluded.file_id,issue_date=excluded.issue_date,expiry_date=excluded.expiry_date,notes=excluded.notes,version=excluded.version,renewal_confirmed_at=excluded.renewal_confirmed_at,updated_at=now() RETURNING * INTO saved;
  INSERT INTO btb_compliance_versions(document_id,version,file_id,issue_date,expiry_date,confirmed_by,confirmed_by_name,reason)
    VALUES(saved.id,saved.version,file,saved.issue_date,expiry,p_actor,actor.name,p_data->>'reason');
  UPDATE btb_email_jobs SET status='cancelled',error='Superseded by a confirmed document revision' WHERE kind='expiry' AND payload->>'document_id'=saved.id::text AND status IN ('pending','failed');
  PERFORM btb_event(p_location,'compliance',saved.id,CASE WHEN current.id IS NULL THEN 'create' ELSE 'renew_or_correct' END,p_actor,to_jsonb(current),to_jsonb(saved),p_data->>'reason');
  RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION btb_daily_report_data(p_location uuid,p_date date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT jsonb_build_object('location_id',l.id,'location',l.name,'business_date',p_date,'timezone',s.timezone,
    'checklists',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.check_type) FROM btb_shift_checks c WHERE c.location_id=l.id AND c.check_date=p_date),'[]'),
    'templates',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT DISTINCT ON(kind) kind,tasks,version FROM btb_operation_templates WHERE location_id=l.id AND effective_from<=p_date ORDER BY kind,effective_from DESC,version DESC) t),'[]'),
    'equipment',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'slots',e.slots) ORDER BY e.name) FROM equipment e WHERE e.location_id=l.id AND e.active_from<=p_date AND (e.retired_after IS NULL OR e.retired_after>=p_date)),'[]'),
    'temperatures',coalesce((SELECT jsonb_agg(to_jsonb(t)-'user_id' ORDER BY t.equipment_name,t.slot) FROM temperature_records t WHERE t.location_id=l.id AND t.business_date=p_date),'[]'),
    'sanitizer',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.slot) FROM btb_sanitizer_logs t WHERE t.location_id=l.id AND t.business_date=p_date),'[]'),
    'sanitizer_slots',coalesce((SELECT to_jsonb(t.slots) FROM btb_sanitizer_settings t WHERE t.location_id=l.id),'["11:00","16:00","20:00"]'))
  FROM locations l JOIN btb_location_settings s ON s.location_id=l.id WHERE l.id=p_location;
$$;

CREATE OR REPLACE FUNCTION btb_schedule_automation(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE settings record; doc compliance_documents; local_now timestamp; report_date date; local_date date; recipient text;
  payload jsonb; lead integer; remaining integer; chosen integer; inserted integer:=0; affected integer; staff_email text;
BEGIN
  FOR settings IN SELECT s.*,l.name FROM btb_location_settings s JOIN locations l ON l.id=s.location_id WHERE s.active AND s.timezone IS NOT NULL LOOP
    local_now:=p_now AT TIME ZONE settings.timezone; local_date:=local_now::date;
    IF settings.reports_enabled AND settings.settings_confirmed THEN
      report_date:=local_date-CASE WHEN local_now::time<settings.report_time THEN 1 ELSE 0 END-CASE WHEN settings.report_time<settings.business_day_start THEN 1 ELSE 0 END;
      payload:=btb_daily_report_data(settings.location_id,report_date);
      FOR recipient IN SELECT DISTINCT lower(trim(x)) FROM unnest(settings.manager_emails||settings.owner_emails||settings.additional_emails) x WHERE trim(x)<>'' LOOP
        INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,business_date,recipient,subject,body,payload)
        VALUES('daily:'||settings.location_id||':'||report_date||':'||recipient,settings.location_id,'daily',report_date,recipient,
          'BTB Daily Operations Report — '||settings.name||' — '||report_date,'Your daily operations report is attached. Missing entries are marked incomplete.',payload) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS affected=ROW_COUNT; inserted:=inserted+affected;
      END LOOP;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'checklists') c WHERE (c->>'completed')::boolean=false) OR jsonb_array_length(payload->'checklists')<3
        OR jsonb_array_length(payload->'temperatures') < jsonb_array_length(payload->'equipment')*3 OR jsonb_array_length(payload->'sanitizer')<3 THEN
        PERFORM btb_notify(settings.location_id,ARRAY['manager','corporate'],'daily-incomplete:'||settings.location_id||':'||report_date,'Daily operations incomplete',report_date||': review missing tasks or food safety readings.','/between-the-buns/platform?module=operations&date='||report_date,NULL,false);
      END IF;
    END IF;
    IF settings.reminders_enabled THEN
      FOR doc IN SELECT * FROM compliance_documents WHERE location_id=settings.location_id AND expiry_date IS NOT NULL LOOP
        remaining:=doc.expiry_date-local_date; chosen:=NULL;
        SELECT min(x) INTO chosen FROM unnest(settings.reminder_days) x WHERE x>=remaining;
        IF chosen IS NULL THEN CONTINUE; END IF;
        SELECT email INTO staff_email FROM btb_employees WHERE id=doc.employee_id AND active;
        FOR recipient IN SELECT DISTINCT lower(trim(x)) FROM unnest(settings.manager_emails||settings.owner_emails||settings.compliance_emails||doc.recipients||CASE WHEN staff_email IS NULL THEN '{}'::text[] ELSE ARRAY[staff_email] END) x WHERE trim(x)<>'' LOOP
          INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,recipient,subject,body,payload)
          VALUES('expiry:'||doc.id||':'||doc.version||':'||doc.expiry_date||':'||chosen||':'||recipient,settings.location_id,'expiry',recipient,
            'Action Required — '||doc.name||' Expiring Soon',doc.name||' at '||settings.name||E'\nType: '||doc.doc_type||E'\nLicence / certificate: '||coalesce(doc.licence_number,'Not recorded')||E'\nHolder: '||coalesce((SELECT name FROM btb_employees WHERE id=doc.employee_id),'Location')||E'\nExpiry: '||doc.expiry_date||E'\nDays remaining: '||remaining||E'\nAction: arrange renewal and confirm the new expiry date in the secure BTB compliance register.',
            jsonb_build_object('document_id',doc.id,'version',doc.version,'expiry',doc.expiry_date,'lead_days',chosen,'days_remaining',remaining)) ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS affected=ROW_COUNT; inserted:=inserted+affected;
        END LOOP;
        PERFORM btb_notify(settings.location_id,ARRAY['manager','corporate'],'expiry:'||doc.id||':'||doc.version||':'||chosen,'Certificate approaching expiry',doc.name||' expires '||doc.expiry_date,'/between-the-buns/platform?module=compliance',NULL,false);
      END LOOP;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('enqueued',inserted);
END $$;

-- Freeze the exact sender and attachment before the first provider attempt.
-- Retries read these bytes; settings changes never change an idempotent payload.
CREATE OR REPLACE FUNCTION btb_prepare_email_job(p_id uuid,p_lease uuid,p_from text,p_attachment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE job btb_email_jobs;
BEGIN
  SELECT * INTO job FROM btb_email_jobs WHERE id=p_id AND lease_token=p_lease AND status='sending' AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF job.kind='expiry' AND NOT EXISTS(SELECT 1 FROM compliance_documents d WHERE d.id=(job.payload->>'document_id')::uuid AND d.version=(job.payload->>'version')::integer AND d.expiry_date=(job.payload->>'expiry')::date) THEN
    UPDATE btb_email_jobs SET status='cancelled',error='Superseded document revision',lease_until=NULL,lease_token=NULL WHERE id=p_id;
    RETURN NULL;
  END IF;
  IF job.kind='daily' AND coalesce(job.attachment_base64,p_attachment) IS NULL THEN RAISE EXCEPTION 'Daily PDF attachment required'; END IF;
  UPDATE btb_email_jobs SET frozen_from=coalesce(frozen_from,p_from),attachment_base64=coalesce(attachment_base64,p_attachment),
    attachment_name=CASE WHEN job.kind='daily' THEN coalesce(attachment_name,'BTB-Operations-'||business_date||'.pdf') ELSE attachment_name END
    WHERE id=p_id RETURNING * INTO job;
  RETURN to_jsonb(job);
END $$;

CREATE OR REPLACE FUNCTION btb_platform_resend(p_actor uuid,p_session integer,p_location uuid,p_date date,p_key uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; settings btb_location_settings; payload jsonb; recipient text; count integer:=0;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'reports');
  IF coalesce(trim(p_reason),'')='' OR p_key IS NULL THEN RAISE EXCEPTION 'Resend reason and request key required'; END IF;
  SELECT * INTO settings FROM btb_location_settings WHERE location_id=p_location;
  payload:=btb_daily_report_data(p_location,p_date);
  FOR recipient IN SELECT DISTINCT lower(trim(x)) FROM unnest(settings.manager_emails||settings.owner_emails||settings.additional_emails) x WHERE trim(x)<>'' LOOP
    INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,business_date,recipient,subject,body,payload)
    VALUES('manual:'||p_key||':'||recipient,p_location,'daily',p_date,recipient,'BTB Daily Operations Report — '||(payload->>'location')||' — '||p_date||' (resend)',
      'Requested by '||actor.name||'. Reason: '||p_reason,payload) ON CONFLICT DO NOTHING;
    count:=count+1;
  END LOOP;
  IF count=0 THEN RAISE EXCEPTION 'Configure authorized report recipients first'; END IF;
  PERFORM btb_event(p_location,'daily_report',p_key,'resend_requested',p_actor,NULL,jsonb_build_object('date',p_date),p_reason);
  RETURN jsonb_build_object('queued_recipients',count);
END $$;

DO $$ DECLARE f record; BEGIN
  ALTER TABLE btb_compliance_versions ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON btb_compliance_versions FROM PUBLIC,anon,authenticated;
  GRANT SELECT,INSERT ON btb_compliance_versions TO service_role;
  GRANT ALL ON compliance_documents TO service_role;
  ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS btb_location_private ON compliance_documents;
  CREATE POLICY btb_location_private ON compliance_documents AS RESTRICTIVE TO anon,authenticated USING(location_id IS NULL OR restaurant_name<>'Between the Buns') WITH CHECK(location_id IS NULL OR restaurant_name<>'Between the Buns');
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'btb_platform_%' OR proname IN ('btb_daily_report_data','btb_schedule_automation','btb_prepare_email_job')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
