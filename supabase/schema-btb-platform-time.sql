-- Release 13. Apply AFTER platform foundation/operations/api. Legacy shifts keep
-- location_id NULL. No location is guessed and no time record is purged.
BEGIN;
ALTER TABLE btb_shifts ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES btb_location_settings(location_id);
ALTER TABLE btb_shifts ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE INDEX IF NOT EXISTS btb_shifts_location_week ON btb_shifts(location_id,shift_date) WHERE cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS btb_time_entries (
  id uuid PRIMARY KEY, location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  employee_id uuid NOT NULL REFERENCES btb_employees(id), shift_id uuid REFERENCES btb_shifts(id),
  work_date date NOT NULL, recorded_in timestamptz NOT NULL, recorded_out timestamptz,
  effective_in timestamptz NOT NULL, effective_out timestamptz, break_minutes integer CHECK(break_minutes>=0 AND break_minutes<=1440),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','changes_requested','approved')),
  notes text NOT NULL DEFAULT '', review_notes text, reviewed_by uuid REFERENCES btb_employees(id), reviewed_by_name text, reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status='open' OR (effective_out IS NOT NULL AND break_minutes IS NOT NULL AND effective_out>effective_in
    AND effective_out-effective_in<=interval '24 hours' AND break_minutes<=extract(epoch FROM effective_out-effective_in)/60)),
  CHECK(status<>'approved' OR (reviewed_by IS NOT NULL AND reviewed_by<>employee_id AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS btb_time_one_open ON btb_time_entries(employee_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS btb_time_location_week ON btb_time_entries(location_id,work_date);
CREATE TABLE IF NOT EXISTS btb_time_commands (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES btb_employees(id), location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  action text NOT NULL, data jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION btb_time_keep_punches()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.employee_id<>OLD.employee_id OR NEW.location_id<>OLD.location_id OR NEW.recorded_in<>OLD.recorded_in
    OR (OLD.recorded_out IS NOT NULL AND NEW.recorded_out IS DISTINCT FROM OLD.recorded_out) THEN
    RAISE EXCEPTION 'Original clock punches are immutable' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS btb_time_original_punches ON btb_time_entries;
CREATE TRIGGER btb_time_original_punches BEFORE UPDATE ON btb_time_entries FOR EACH ROW EXECUTE FUNCTION btb_time_keep_punches();

CREATE OR REPLACE FUNCTION btb_platform_time(p_actor uuid,p_session integer,p_location uuid,p_request uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current btb_time_entries; saved btb_time_entries; prior btb_time_commands;
  settings btb_location_settings; shift btb_shifts; v_now timestamptz; v_start timestamptz; v_end timestamptz; v_break integer;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.read');
  IF p_request IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR length(coalesce(p_data->>'notes',''))>2000 OR length(coalesce(p_data->>'reason',''))>2000 THEN RAISE EXCEPTION 'Invalid time command' USING ERRCODE='22023'; END IF;
  -- Also serializes clocks across locations. A person cannot hold two open clocks.
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-time',0));
  SELECT * INTO prior FROM btb_time_commands WHERE id=p_request;
  IF prior.id IS NOT NULL THEN
    IF prior.actor_id<>p_actor OR prior.location_id<>p_location OR prior.action<>p_action OR prior.data<>p_data THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE='40001'; END IF;
    RETURN prior.result;
  END IF;
  SELECT * INTO settings FROM btb_location_settings WHERE location_id=p_location;
  IF settings.timezone IS NULL THEN RAISE EXCEPTION 'Confirm the location timezone before clocking time' USING ERRCODE='22023'; END IF;
  v_now:=clock_timestamp();
  IF p_action='clock_in' THEN
    IF actor.role NOT IN ('staff','supervisor','manager') THEN RAISE EXCEPTION 'Employee clock access required' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM btb_time_entries WHERE employee_id=p_actor AND status='open') THEN RAISE EXCEPTION 'Already clocked in; finish the open entry first' USING ERRCODE='40001'; END IF;
    IF nullif(p_data->>'shift_id','') IS NOT NULL THEN
      SELECT * INTO shift FROM btb_shifts WHERE id=(p_data->>'shift_id')::uuid AND location_id=p_location AND employee_id=p_actor AND cancelled_at IS NULL;
      IF shift.id IS NULL THEN RAISE EXCEPTION 'Choose your own shift at this location' USING ERRCODE='42501'; END IF;
      IF abs(shift.shift_date-(v_now AT TIME ZONE settings.timezone)::date)>1 THEN RAISE EXCEPTION 'Choose today’s shift or clock as unscheduled' USING ERRCODE='22023'; END IF;
    END IF;
    INSERT INTO btb_time_entries(id,location_id,employee_id,shift_id,work_date,recorded_in,effective_in,notes)
       VALUES(p_request,p_location,p_actor,shift.id,((v_now AT TIME ZONE settings.timezone)-settings.business_day_start::interval)::date,v_now,v_now,coalesce(p_data->>'notes','')) RETURNING * INTO saved;
  ELSE
    SELECT * INTO current FROM btb_time_entries WHERE id=(p_data->>'id')::uuid AND location_id=p_location FOR UPDATE;
    IF current.id IS NULL THEN RAISE EXCEPTION 'Time entry is outside this location' USING ERRCODE='42501'; END IF;
    IF current.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Time entry changed; reload' USING ERRCODE='40001'; END IF;
    IF p_action='clock_out' THEN
      IF current.employee_id<>p_actor OR current.status<>'open' THEN RAISE EXCEPTION 'Only the employee can finish their open clock' USING ERRCODE='42501'; END IF;
      v_start:=current.effective_in; v_end:=v_now; v_break:=(p_data->>'break_minutes')::integer;
      IF v_break IS NULL OR v_break<0 OR v_end-v_start>interval '24 hours' OR v_break>extract(epoch FROM v_end-v_start)/60 THEN RAISE EXCEPTION 'Check the break minutes; stale clocks need an explained correction' USING ERRCODE='22023'; END IF;
      UPDATE btb_time_entries SET recorded_out=v_end,effective_out=v_end,break_minutes=v_break,status='pending',notes=coalesce(p_data->>'notes',''),version=version+1,updated_at=v_now WHERE id=current.id RETURNING * INTO saved;
    ELSIF p_action='correct' THEN
      IF current.status='approved' THEN RAISE EXCEPTION 'Reopen approval before requesting a correction' USING ERRCODE='40001'; END IF;
      IF current.employee_id<>p_actor AND (actor.role NOT IN ('manager','owner') OR current.employee_id=p_actor) THEN RAISE EXCEPTION 'Only this employee or their manager can propose a correction' USING ERRCODE='42501'; END IF;
      IF coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='22023'; END IF;
      v_start:=(p_data->>'effective_in')::timestamptz; v_end:=(p_data->>'effective_out')::timestamptz; v_break:=(p_data->>'break_minutes')::integer;
      IF v_start IS NULL OR v_end IS NULL OR v_break IS NULL OR v_start>v_now OR v_end>v_now OR v_end<=v_start OR v_end-v_start>interval '24 hours'
        OR v_break<0 OR v_break>extract(epoch FROM v_end-v_start)/60 THEN RAISE EXCEPTION 'Invalid correction times or breaks' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM btb_time_entries t WHERE t.employee_id=current.employee_id AND t.id<>current.id AND t.effective_in<v_end
        AND coalesce(t.effective_out,v_now)>v_start) THEN RAISE EXCEPTION 'Corrected time overlaps another entry' USING ERRCODE='22023'; END IF;
      UPDATE btb_time_entries SET effective_in=v_start,effective_out=v_end,break_minutes=v_break,status='pending',notes=p_data->>'reason',
         work_date=((v_start AT TIME ZONE settings.timezone)-settings.business_day_start::interval)::date,reviewed_by=NULL,reviewed_by_name=NULL,reviewed_at=NULL,review_notes=NULL,version=version+1,updated_at=v_now WHERE id=current.id RETURNING * INTO saved;
    ELSIF p_action IN ('approve','request_changes','reopen') THEN
      IF actor.role NOT IN ('manager','owner') OR current.employee_id=p_actor THEN RAISE EXCEPTION 'Manager approval is required; self-approval is forbidden' USING ERRCODE='42501'; END IF;
      IF p_action='reopen' THEN
        IF current.status<>'approved' OR coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Approved entry and reopen reason required' USING ERRCODE='22023'; END IF;
      ELSIF current.status<>'pending' THEN RAISE EXCEPTION 'Only pending hours can be reviewed' USING ERRCODE='40001'; END IF;
      IF p_action='request_changes' AND coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Explain the requested correction' USING ERRCODE='22023'; END IF;
      UPDATE btb_time_entries SET status=CASE p_action WHEN 'approve' THEN 'approved' WHEN 'request_changes' THEN 'changes_requested' ELSE 'pending' END,
        reviewed_by=CASE WHEN p_action<>'reopen' THEN p_actor END,reviewed_by_name=CASE WHEN p_action<>'reopen' THEN actor.name END,
        reviewed_at=CASE WHEN p_action<>'reopen' THEN v_now END,review_notes=p_data->>'reason',version=version+1,updated_at=v_now WHERE id=current.id RETURNING * INTO saved;
    ELSE RAISE EXCEPTION 'Unknown time action' USING ERRCODE='22023'; END IF;
  END IF;
  PERFORM btb_event(p_location,'time_entry',saved.id,p_action,p_actor,to_jsonb(current),to_jsonb(saved),p_data->>'reason');
  IF saved.status='pending' THEN
    PERFORM btb_notify(p_location,ARRAY['manager'],'hours:'||saved.id||':'||saved.version,'Worked hours need review',actor.name||' submitted an hours record.','/btb/demo/staff-schedule',NULL,false);
  END IF;
  INSERT INTO btb_time_commands(id,actor_id,location_id,action,data,result) VALUES(p_request,p_actor,p_location,p_action,p_data,to_jsonb(saved));
  RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION btb_platform_schedule(p_actor uuid,p_session integer,p_location uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current btb_shifts; saved btb_shifts; v_start timestamptz; v_end timestamptz; v_id uuid;
  wall_start timestamp; wall_end timestamp; tz text;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.read');
  IF actor.role NOT IN ('supervisor','manager','owner') THEN RAISE EXCEPTION 'Schedule lead access required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-schedule',0));
  v_id:=(p_data->>'id')::uuid;
  SELECT * INTO current FROM btb_shifts WHERE id=v_id FOR UPDATE;
  IF current.id IS NOT NULL AND current.location_id IS DISTINCT FROM p_location THEN RAISE EXCEPTION 'Shift is outside this location' USING ERRCODE='42501'; END IF;
  IF coalesce(current.version,0) IS DISTINCT FROM (p_data->>'version')::integer OR current.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Schedule changed; reload' USING ERRCODE='40001'; END IF;
  IF p_action='delete' THEN
    IF current.id IS NULL THEN RAISE EXCEPTION 'Saved shift required' USING ERRCODE='22023'; END IF;
    UPDATE btb_shifts SET cancelled_at=now(),version=version+1,updated_by_name=actor.name WHERE id=v_id RETURNING * INTO saved;
  ELSIF p_action='save' THEN
    IF NOT EXISTS(SELECT 1 FROM btb_employees e JOIN btb_location_access a ON a.employee_id=e.id WHERE e.id=(p_data->>'employee_id')::uuid AND e.active AND a.location_id=p_location) THEN RAISE EXCEPTION 'Employee needs this location membership' USING ERRCODE='42501'; END IF;
    IF p_data->>'start_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR p_data->>'end_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (p_data->>'ends_next_day') IS NULL THEN RAISE EXCEPTION 'Valid start/end times required' USING ERRCODE='22023'; END IF;
    SELECT timezone INTO tz FROM btb_location_settings WHERE location_id=p_location;
    IF tz IS NULL THEN RAISE EXCEPTION 'Confirm the location timezone before scheduling' USING ERRCODE='22023'; END IF;
    wall_start:=(p_data->>'shift_date')::date+(p_data->>'start_time')::time;
    wall_end:=(p_data->>'shift_date')::date+(p_data->>'end_time')::time+CASE WHEN (p_data->>'ends_next_day')::boolean THEN interval '1 day' ELSE interval '0' END;
    v_start:=wall_start AT TIME ZONE tz;
    v_end:=wall_end AT TIME ZONE tz;
    -- A timetable has no offset selector. Reject skipped/repeated DST boundary
    -- times rather than silently choosing one of two possible employee shifts.
    IF (v_start AT TIME ZONE tz) IS DISTINCT FROM wall_start OR (v_end AT TIME ZONE tz) IS DISTINCT FROM wall_end
      OR EXISTS(SELECT 1 FROM unnest(ARRAY[-120,-60,-30,30,60,120]) minutes
        WHERE ((v_start+minutes*interval '1 minute') AT TIME ZONE tz)=wall_start
           OR ((v_end+minutes*interval '1 minute') AT TIME ZONE tz)=wall_end) THEN
      RAISE EXCEPTION 'Choose unambiguous schedule times outside the daylight-saving clock change' USING ERRCODE='22023'; END IF;
    IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start OR v_end-v_start>interval '1 day' THEN RAISE EXCEPTION 'Invalid shift times' USING ERRCODE='22023'; END IF;
    -- Legacy rows have no timezone. Nearby unscoped shifts require review, not
    -- an invented location or a wall-clock comparison to a different timezone.
    IF EXISTS(SELECT 1 FROM btb_shifts s LEFT JOIN btb_location_settings l ON l.location_id=s.location_id
      WHERE s.employee_id=(p_data->>'employee_id')::uuid AND s.id<>v_id AND s.cancelled_at IS NULL AND l.timezone IS NULL
        AND s.shift_date BETWEEN (p_data->>'shift_date')::date-1 AND (p_data->>'shift_date')::date+1) THEN
      RAISE EXCEPTION 'Review nearby legacy or timezone-unconfigured shifts before scheduling this employee' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM btb_shifts s JOIN btb_location_settings l ON l.location_id=s.location_id
      WHERE s.employee_id=(p_data->>'employee_id')::uuid AND s.id<>v_id AND s.cancelled_at IS NULL
        AND ((s.shift_date+s.start_time::time) AT TIME ZONE l.timezone)<v_end
        AND ((s.shift_date+s.end_time::time+CASE WHEN s.ends_next_day THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE l.timezone)>v_start) THEN
      RAISE EXCEPTION 'Overlapping shift' USING ERRCODE='23P01'; END IF;
    IF current.id IS NOT NULL AND current.employee_id<>(p_data->>'employee_id')::uuid AND EXISTS(SELECT 1 FROM btb_time_entries WHERE shift_id=current.id) THEN RAISE EXCEPTION 'A clocked shift cannot be reassigned to another employee' USING ERRCODE='22023'; END IF;
    INSERT INTO btb_shifts(id,location_id,employee_id,shift_date,start_time,end_time,ends_next_day,duty,version,updated_by_name)
      VALUES(v_id,p_location,(p_data->>'employee_id')::uuid,(p_data->>'shift_date')::date,p_data->>'start_time',p_data->>'end_time',(p_data->>'ends_next_day')::boolean,p_data->>'duty',coalesce(current.version,0)+1,actor.name)
      ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,shift_date=excluded.shift_date,start_time=excluded.start_time,end_time=excluded.end_time,
        ends_next_day=excluded.ends_next_day,duty=excluded.duty,version=excluded.version,updated_by_name=excluded.updated_by_name,updated_at=now() RETURNING * INTO saved;
  ELSE RAISE EXCEPTION 'Unknown schedule action' USING ERRCODE='22023'; END IF;
  PERFORM btb_event(p_location,'shift',saved.id,p_action,p_actor,to_jsonb(current),to_jsonb(saved));
  RETURN to_jsonb(saved);
END $$;

-- Keep the old timetable usable, but it must never read, overwrite or delete
-- location-scoped shifts. The HTTP route also filters location_id IS NULL.
CREATE OR REPLACE FUNCTION public.btb_save_shift(p_id uuid,p_version integer,p_employee_id uuid,p_date date,p_start text,p_end text,p_next_day boolean,p_duty text,p_actor text)
RETURNS SETOF public.btb_shifts LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_shifts; saved btb_shifts; start_at timestamp; end_at timestamp;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-schedule',0));
  IF EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_employee_id) THEN RAISE EXCEPTION 'Use the location schedule for this employee' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM btb_employees WHERE id=p_employee_id AND active) THEN RAISE EXCEPTION 'Employee is inactive'; END IF;
  SELECT * INTO current FROM btb_shifts WHERE id=p_id FOR UPDATE;
  IF current.id IS NOT NULL AND current.location_id IS NOT NULL THEN RAISE EXCEPTION 'Use the location schedule for this shift' USING ERRCODE='42501'; END IF;
  IF coalesce(current.version,0)<>p_version OR (p_id IS NOT NULL AND current.id IS NULL) THEN RAISE EXCEPTION 'Stale shift' USING ERRCODE='40001'; END IF;
  start_at:=p_date+p_start::time; end_at:=p_date+p_end::time+CASE WHEN p_next_day THEN interval '1 day' ELSE interval '0' END;
  IF end_at<=start_at OR end_at-start_at>interval '1 day' THEN RAISE EXCEPTION 'Invalid shift times'; END IF;
  IF EXISTS(SELECT 1 FROM btb_shifts WHERE employee_id=p_employee_id AND id IS DISTINCT FROM p_id AND cancelled_at IS NULL
    AND shift_date+start_time::time<end_at AND shift_date+end_time::time+CASE WHEN ends_next_day THEN interval '1 day' ELSE interval '0' END>start_at) THEN RAISE EXCEPTION 'Overlapping shift' USING ERRCODE='23P01'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO btb_shifts(employee_id,shift_date,start_time,end_time,ends_next_day,duty,updated_by_name)
      VALUES(p_employee_id,p_date,p_start,p_end,p_next_day,p_duty,p_actor) RETURNING * INTO saved;
  ELSE
    UPDATE btb_shifts SET employee_id=p_employee_id,shift_date=p_date,start_time=p_start,end_time=p_end,ends_next_day=p_next_day,duty=p_duty,
      updated_by_name=p_actor,updated_at=now(),version=version+1 WHERE id=p_id RETURNING * INTO saved;
  END IF;
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION btb_platform_time_read(p_actor uuid,p_session integer,p_location uuid,p_start date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees; tz text; full_team boolean;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.read');
  IF p_start IS NULL THEN RAISE EXCEPTION 'Choose a schedule week' USING ERRCODE='22023'; END IF;
  SELECT timezone INTO tz FROM btb_location_settings WHERE location_id=p_location;
  IF tz IS NULL THEN RAISE EXCEPTION 'Configure the location timezone first' USING ERRCODE='22023'; END IF;
  full_team:=actor.role IN ('manager','corporate','owner');
  RETURN jsonb_build_object('timezone',tz,'today',(now() AT TIME ZONE tz)::date,
    'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'role',e.role,'active',e.active,'position',e.position) ORDER BY e.name,e.id)
      FROM btb_employees e WHERE EXISTS(SELECT 1 FROM btb_location_access a WHERE a.employee_id=e.id AND a.location_id=p_location)
      OR EXISTS(SELECT 1 FROM btb_shifts s WHERE s.employee_id=e.id AND s.location_id=p_location)
      OR EXISTS(SELECT 1 FROM btb_time_entries t WHERE t.employee_id=e.id AND t.location_id=p_location AND (full_team OR t.employee_id=p_actor))),'[]'),
    'shifts',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.shift_date,s.start_time,s.id) FROM btb_shifts s WHERE location_id=p_location AND cancelled_at IS NULL AND shift_date BETWEEN p_start AND p_start+6),'[]'),
    'entries',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.work_date,t.recorded_in,t.id) FROM btb_time_entries t WHERE location_id=p_location AND work_date BETWEEN p_start AND p_start+6 AND (full_team OR employee_id=p_actor)),'[]'),
    'open_entry',(SELECT to_jsonb(t) FROM btb_time_entries t WHERE employee_id=p_actor AND status='open'),
    'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'entity_id',e.entity_id,'action',e.action,'actor_name',e.actor_name,'reason',e.reason,'created_at',e.created_at) ORDER BY e.created_at,e.id)
      FROM btb_events e JOIN btb_time_entries t ON t.id=e.entity_id AND e.entity_type='time_entry' WHERE t.location_id=p_location AND t.work_date BETWEEN p_start AND p_start+6 AND (full_team OR t.employee_id=p_actor)),'[]')
  );
END $$;

DO $$ DECLARE tab text; f record; BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_time_entries','btb_time_commands'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO service_role',tab);
  END LOOP;
  REVOKE UPDATE ON btb_time_commands FROM service_role;
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname='btb_time_keep_punches' OR proname LIKE 'btb_platform_%') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
