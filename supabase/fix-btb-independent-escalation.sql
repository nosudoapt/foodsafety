-- DB-13: missed-operation escalation is not an email-report subscription.
-- Use the configured report cutoff; if none exists, inspect the last fully
-- closed business day using the already-configured business-day boundary.
BEGIN;
CREATE OR REPLACE FUNCTION public.btb_schedule_automation(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE settings record; doc compliance_documents; local_now timestamp; report_date date; local_date date; recipient text;
  payload jsonb; lead integer; remaining integer; chosen integer; inserted integer:=0; affected integer; staff_email text;
BEGIN
  FOR settings IN SELECT s.*,l.name FROM btb_location_settings s JOIN locations l ON l.id=s.location_id WHERE s.active AND s.timezone IS NOT NULL LOOP
    local_now:=p_now AT TIME ZONE settings.timezone; local_date:=local_now::date;
    report_date:=CASE WHEN settings.report_time IS NOT NULL THEN
      local_date-CASE WHEN local_now::time<settings.report_time THEN 1 ELSE 0 END-CASE WHEN settings.report_time<settings.business_day_start THEN 1 ELSE 0 END
      ELSE (local_now-settings.business_day_start::interval)::date-1 END;
    payload:=btb_daily_report_data(settings.location_id,report_date);
    IF settings.reports_enabled AND settings.settings_confirmed THEN
      FOR recipient IN SELECT DISTINCT lower(trim(x)) FROM unnest(settings.manager_emails||settings.owner_emails||settings.additional_emails) x WHERE trim(x)<>'' LOOP
        INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,business_date,recipient,subject,body,payload)
        VALUES('daily:'||settings.location_id||':'||report_date||':'||recipient,settings.location_id,'daily',report_date,recipient,
          'BTB Daily Operations Report — '||settings.name||' — '||report_date,'Your daily operations report is attached. Missing entries are marked incomplete.',payload) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS affected=ROW_COUNT; inserted:=inserted+affected;
      END LOOP;
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'checklists') c WHERE (c->>'completed')::boolean=false) OR jsonb_array_length(payload->'checklists')<3
      OR jsonb_array_length(payload->'temperatures') < jsonb_array_length(payload->'equipment')*3 OR jsonb_array_length(payload->'sanitizer')<3 THEN
      PERFORM btb_notify(settings.location_id,ARRAY['manager','corporate'],'daily-incomplete:'||settings.location_id||':'||report_date,'Daily operations incomplete',report_date||': review missing tasks or food safety readings.','/between-the-buns/platform?module=operations&date='||report_date,NULL,false);
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
REVOKE ALL ON FUNCTION public.btb_schedule_automation(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_schedule_automation(timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
