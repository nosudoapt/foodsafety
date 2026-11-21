-- Step 35: console monitoring over managed locations, and the atomic
-- per-location storage cap for platform file uploads.
-- Requires steps 32-34 and the existing location platform + activity releases.
-- Written here, NOT applied. Monitoring exposes counts and timestamps only:
-- never credentials, file payloads, hashes or event before/after data.
BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public.btb_admin_session(uuid,integer)') IS NULL
    OR to_regprocedure('public.btb_platform_file_put(uuid,integer,uuid,jsonb)') IS NULL
    OR to_regclass('public.btb_file_objects') IS NULL OR to_regclass('public.app_activity') IS NULL
    OR to_regclass('public.btb_events') IS NULL OR to_regclass('public.btb_email_jobs') IS NULL
    OR to_regclass('public.btb_document_imports') IS NULL
    OR to_regclass('public.btb_shift_checks') IS NULL OR to_regclass('public.btb_sanitizer_logs') IS NULL
    OR to_regclass('public.temperature_records') IS NULL THEN
    RAISE EXCEPTION 'Install the BTB console, capability and location platform releases before step 35' USING ERRCODE='42P01';
  END IF;
END $$;

-- The time-tracking release is optional for monitoring: databases that have not
-- installed btb_time_entries still get open shifts / review counts as zero.
CREATE OR REPLACE FUNCTION public.btb_admin_time_count(p_location uuid,p_status text)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE total bigint;
BEGIN
  IF to_regclass('public.btb_time_entries') IS NULL THEN RETURN 0; END IF;
  EXECUTE 'SELECT count(*) FROM btb_time_entries WHERE location_id=$1 AND status=$2'
    INTO total USING p_location,p_status;
  RETURN coalesce(total,0);
END $$;

-- One console call for the overview dashboard. Every figure is scoped to
-- btb_superadmin_locations; closed sites still report (they keep history) but
-- are flagged inactive. Visits are the attributed BTB page-activity rows only.
CREATE OR REPLACE FUNCTION public.btb_admin_monitoring(p_actor uuid,p_session integer,p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE sites jsonb; grid jsonb; labels jsonb; recent jsonb; totals jsonb; window_start timestamptz;
BEGIN
  PERFORM btb_admin_session(p_actor,p_session);
  IF p_days IS NULL OR p_days NOT BETWEEN 7 AND 31 THEN
    RAISE EXCEPTION 'Choose an activity window between 7 and 31 days' USING ERRCODE='22023';
  END IF;
  window_start:=now()-make_interval(days=>p_days);

  SELECT coalesce(jsonb_agg(site ORDER BY site->>'name',site->>'id'),'[]'::jsonb) INTO sites FROM (
    SELECT jsonb_build_object(
      'id',l.id,'name',l.name,'active',s.active,'timezone',s.timezone,
      'people',(SELECT count(*) FROM btb_location_access a WHERE a.location_id=l.id),
      'pages',(SELECT count(*) FROM btb_location_page_access g WHERE g.location_id=l.id AND g.allowed),
      'storage_limit_bytes',s.storage_limit_bytes,
      'files',coalesce(f.files,0),'storage_bytes',coalesce(f.bytes,0),
      'file_purposes',coalesce((
        SELECT jsonb_object_agg(pr.purpose,jsonb_build_object('files',coalesce(f2.files,0),'bytes',coalesce(f2.bytes,0)))
        FROM (VALUES ('reference'),('artwork'),('evidence'),('purchase'),('sales'),('compliance'),('report')) pr(purpose)
        LEFT JOIN (SELECT purpose,count(*) files,sum(byte_size) bytes FROM btb_file_objects
          WHERE location_id=l.id GROUP BY purpose) f2 ON f2.purpose=pr.purpose),'{}'::jsonb),
      'views',coalesce(v.views,0),'last_seen',v.last_seen,
      'events',coalesce(e.events,0),
      'ai_used',coalesce(u.used,0),
      'ai_daily_limit',coalesce((SELECT daily_limit FROM btb_ai_settings WHERE location_id=l.id),25),
      -- Operational health. btb_events is the authoritative per-location signal;
      -- page visits above are a best-effort attribution from app_activity.
      'last_activity',(SELECT max(created_at) FROM btb_events WHERE location_id=l.id),
      'busiest_hour',(SELECT extract(hour FROM created_at AT TIME ZONE coalesce(s.timezone,'UTC'))::int
        FROM btb_events WHERE location_id=l.id AND created_at>=window_start
        GROUP BY 1 ORDER BY count(*) DESC,1 LIMIT 1),
      'features',coalesce((SELECT jsonb_agg(jsonb_build_object('type',entity_type,'count',n) ORDER BY n DESC,entity_type) FROM (
        SELECT entity_type,count(*) n FROM btb_events WHERE location_id=l.id AND created_at>=window_start
        GROUP BY entity_type ORDER BY count(*) DESC,entity_type LIMIT 5) top_features),'[]'::jsonb),
      'open_entries',btb_admin_time_count(l.id,'open'),
      'checks_complete',(SELECT count(*) FROM btb_shift_checks c WHERE c.location_id=l.id AND c.check_date=current_date AND c.completed),
      'temperature_readings',(SELECT count(*) FROM temperature_records t WHERE t.location_id=l.id AND t.business_date=current_date),
      'sanitizer_readings',(SELECT count(*) FROM btb_sanitizer_logs t WHERE t.location_id=l.id AND t.business_date=current_date),
      'problems',jsonb_build_object(
        'failed_emails',(SELECT count(*) FROM btb_email_jobs j WHERE j.location_id=l.id AND j.status='failed'),
        'failed_imports',(SELECT count(*) FROM btb_document_imports d WHERE d.location_id=l.id AND d.extraction_error IS NOT NULL),
        'changes_requested',btb_admin_time_count(l.id,'changes_requested'),
        'total',(
          (SELECT count(*) FROM btb_email_jobs j WHERE j.location_id=l.id AND j.status='failed')
          +(SELECT count(*) FROM btb_document_imports d WHERE d.location_id=l.id AND d.extraction_error IS NOT NULL)
          +btb_admin_time_count(l.id,'changes_requested'))),
      'latest_email_error',(SELECT left(j.error,200) FROM btb_email_jobs j
        WHERE j.location_id=l.id AND j.status='failed' AND j.error IS NOT NULL ORDER BY j.created_at DESC LIMIT 1),
      'email_pending',(SELECT count(*) FROM btb_email_jobs j WHERE j.location_id=l.id AND j.status IN ('pending','sending'))
    ) AS site
    FROM btb_superadmin_locations m
    JOIN locations l ON l.id=m.location_id
    JOIN btb_location_settings s ON s.location_id=l.id
    LEFT JOIN (SELECT location_id,count(*) files,sum(byte_size) bytes FROM btb_file_objects GROUP BY location_id) f ON f.location_id=l.id
    LEFT JOIN (SELECT location_id,count(*) views,max(created_at) last_seen FROM app_activity
      WHERE actor_type='btb' AND restaurant_name='Between the Buns' AND created_at>=window_start
      GROUP BY location_id) v ON v.location_id=l.id
    LEFT JOIN (SELECT location_id,count(*) events FROM btb_events WHERE created_at>=window_start GROUP BY location_id) e ON e.location_id=l.id
    LEFT JOIN (SELECT location_id,sum(used) used FROM btb_ai_usage WHERE day>current_date-p_days GROUP BY location_id) u ON u.location_id=l.id
  ) managed_sites;

  totals:=jsonb_build_object(
    'locations',jsonb_array_length(sites),
    'active_locations',(SELECT count(*) FROM jsonb_array_elements(sites) entry WHERE (entry->>'active')::boolean),
    'people',(SELECT count(DISTINCT a.employee_id) FROM btb_location_access a
      WHERE a.location_id IN (SELECT location_id FROM btb_superadmin_locations)),
    'files',(SELECT coalesce(sum((entry->>'files')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'storage_bytes',(SELECT coalesce(sum((entry->>'storage_bytes')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'storage_limit_bytes',(SELECT coalesce(sum((entry->>'storage_limit_bytes')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'views',(SELECT coalesce(sum((entry->>'views')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'events',(SELECT coalesce(sum((entry->>'events')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'ai_used',(SELECT coalesce(sum((entry->>'ai_used')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'problems',(SELECT coalesce(sum((entry->'problems'->>'total')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'open_entries',(SELECT coalesce(sum((entry->>'open_entries')::bigint),0) FROM jsonb_array_elements(sites) entry),
    'email_pending',(SELECT coalesce(sum((entry->>'email_pending')::bigint),0) FROM jsonb_array_elements(sites) entry));

  -- Day 0 is the oldest day of the window; the last row is today. Hours are
  -- UTC so the grid never shifts with the database or browser timezone.
  WITH visits AS (
    SELECT least(greatest(p_days-1-floor(extract(epoch FROM now()-created_at)/86400)::int,0),p_days-1) AS day_index,
      extract(hour FROM created_at AT TIME ZONE 'UTC')::int AS visit_hour
    FROM app_activity
    WHERE actor_type='btb' AND restaurant_name='Between the Buns'
      AND location_id IN (SELECT location_id FROM btb_superadmin_locations)
      AND created_at>=window_start
  )
  SELECT coalesce(jsonb_agg(row_cells ORDER BY day_index),'[]'::jsonb) INTO grid FROM (
    SELECT d.i AS day_index,
      (SELECT jsonb_agg(coalesce(bucket.visits,0) ORDER BY h.h)
       FROM generate_series(0,23) h(h)
       LEFT JOIN (SELECT visit_hour,count(*) visits FROM visits WHERE day_index=d.i GROUP BY visit_hour) bucket ON bucket.visit_hour=h.h
      ) AS row_cells
    FROM generate_series(0,p_days-1) d(i)
  ) day_cells;

  SELECT coalesce(jsonb_agg(to_char(current_date-(p_days-1-d.i),'YYYY-MM-DD') ORDER BY d.i),'[]'::jsonb) INTO labels
  FROM generate_series(0,p_days-1) d(i);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'created_at',event.created_at,'location_id',event.location_id,'location',event.name,
    'entity_type',event.entity_type,'action',event.action,'actor_name',event.actor_name
  ) ORDER BY event.created_at DESC,event.id DESC),'[]'::jsonb) INTO recent
  FROM (SELECT ev.*,l2.name FROM btb_events ev JOIN locations l2 ON l2.id=ev.location_id
    WHERE ev.location_id IN (SELECT location_id FROM btb_superadmin_locations)
    ORDER BY ev.created_at DESC,ev.id DESC LIMIT 12) event;

  RETURN jsonb_build_object('days',p_days,'generated_at',now(),'day_labels',labels,'heatmap',grid,
    'totals',totals,'locations',sites,'recent',recent);
END $$;

-- Replace the platform's file upload with the same contract plus an atomic
-- aggregate cap. This remains the ONLY insert path into btb_file_objects
-- (UPDATE and DELETE stay revoked even from service_role), so serializing
-- uploads per location under a transaction advisory lock and re-reading the
-- usage inside the same transaction makes the cap un-raceable.
CREATE OR REPLACE FUNCTION public.btb_platform_file_put(p_actor uuid,p_session integer,p_location uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; saved btb_file_objects; purpose text:=p_data->>'purpose';
  limit_bytes bigint; used bigint; new_bytes bigint;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,CASE purpose WHEN 'reference' THEN 'marketing.request' WHEN 'artwork' THEN 'marketing.design'
    WHEN 'evidence' THEN 'operations.write' WHEN 'purchase' THEN 'purchase.upload' WHEN 'sales' THEN 'inventory.write' WHEN 'compliance' THEN 'compliance.write' ELSE 'invalid' END);
  new_bytes:=coalesce((p_data->>'byte_size')::bigint,0);
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-file-storage:'||p_location::text,0));
  SELECT s.storage_limit_bytes,coalesce((SELECT sum(f.byte_size) FROM btb_file_objects f WHERE f.location_id=p_location),0)
    INTO limit_bytes,used FROM btb_location_settings s WHERE s.location_id=p_location;
  IF limit_bytes IS NULL THEN RAISE EXCEPTION 'Choose an active BTB location' USING ERRCODE='42501'; END IF;
  IF used+new_bytes>limit_bytes THEN
    RAISE EXCEPTION 'This location is at its % storage limit',pg_size_pretty(limit_bytes) USING ERRCODE='22023';
  END IF;
  INSERT INTO btb_file_objects(id,location_id,owner_id,purpose,name,mime,byte_size,sha256,content_base64)
    VALUES((p_data->>'id')::uuid,p_location,p_actor,purpose,p_data->>'name',p_data->>'mime',(p_data->>'byte_size')::integer,p_data->>'sha256',p_data->>'content_base64') RETURNING * INTO saved;
  PERFORM btb_event(p_location,'file',saved.id,'upload',p_actor,NULL,to_jsonb(saved)-'content_base64');
  RETURN to_jsonb(saved)-'content_base64';
END $$;

-- Read model for the failed-upload message and any future storage UI: the
-- actor must still hold a live personal session with platform read access.
CREATE OR REPLACE FUNCTION public.btb_platform_storage_usage(p_actor uuid,p_session integer,p_location uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE actor btb_employees; current_usage record;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.read');
  SELECT coalesce((SELECT sum(f.byte_size) FROM btb_file_objects f WHERE f.location_id=p_location),0) AS used,
    s.storage_limit_bytes AS limit_bytes,
    (SELECT count(*) FROM btb_file_objects f WHERE f.location_id=p_location) AS files
  INTO current_usage FROM btb_location_settings s WHERE s.location_id=p_location;
  IF current_usage.limit_bytes IS NULL THEN RAISE EXCEPTION 'Choose an active BTB location' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('used',current_usage.used,'limit_bytes',current_usage.limit_bytes,'files',current_usage.files);
END $$;

-- Console monitoring scans attributed BTB activity by location and window.
CREATE INDEX IF NOT EXISTS btb_activity_location_window ON app_activity(location_id,created_at) WHERE actor_type='btb';

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE 'btb_admin_%' OR proname IN ('btb_platform_file_put','btb_platform_storage_usage')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
