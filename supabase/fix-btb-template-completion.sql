-- DB-23: approved templates define duties, never completion evidence.
-- Normalize new templates and new instances of historical templates without
-- rewriting any saved instance or prior approval/audit record.
BEGIN;
CREATE OR REPLACE FUNCTION public.btb_uncompleted_template_tasks(p_tasks jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg((task-ARRAY['completed','completed_at','completed_by','completed_by_name','value','notes','evidence_id'])
    ||jsonb_build_object('completed',false) ORDER BY ord),'[]')
  FROM jsonb_array_elements(p_tasks) WITH ORDINALITY AS t(task,ord);
$$;
REVOKE ALL ON FUNCTION public.btb_uncompleted_template_tasks(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_uncompleted_template_tasks(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.btb_clean_template_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN NEW.tasks:=btb_uncompleted_template_tasks(NEW.tasks); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.btb_clean_template_completion() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS btb_clean_template_completion ON public.btb_operation_templates;
CREATE TRIGGER btb_clean_template_completion BEFORE INSERT OR UPDATE ON public.btb_operation_templates
  FOR EACH ROW EXECUTE FUNCTION public.btb_clean_template_completion();

CREATE OR REPLACE FUNCTION public.btb_platform_save_check(p_actor uuid,p_session integer,p_location uuid,p_date date,p_kind text,p_version integer,p_changes jsonb,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor btb_employees; current btb_shift_checks; saved btb_shift_checks; items jsonb; change jsonb; item jsonb; idx integer; completed boolean; done integer; total integer; evidence uuid;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'operations.write');
  IF p_date IS NULL OR p_kind NOT IN ('opening','closing','cleaning') THEN RAISE EXCEPTION 'Choose checklist and date'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('check:'||p_location||':'||p_date||':'||p_kind,0));
  SELECT * INTO current FROM btb_shift_checks WHERE location_id=p_location AND check_date=p_date AND check_type=p_kind FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Checklist changed; reload' USING ERRCODE='40001'; END IF;
  IF current.id IS NOT NULL THEN items:=current.items;
  ELSE SELECT btb_uncompleted_template_tasks(tasks) INTO items FROM btb_operation_templates WHERE location_id=p_location AND kind=p_kind AND effective_from<=p_date ORDER BY effective_from DESC,version DESC LIMIT 1; END IF;
  IF items IS NULL THEN RAISE EXCEPTION 'Manager must configure this checklist first'; END IF;
  IF (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(p_changes) c)<>jsonb_array_length(p_changes) THEN RAISE EXCEPTION 'Duplicate task changes'; END IF;
  FOR change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    SELECT value,ordinality::integer-1 INTO item,idx FROM jsonb_array_elements(items) WITH ORDINALITY WHERE value->>'id'=change->>'id';
    IF item IS NULL THEN RAISE EXCEPTION 'Unknown task'; END IF;
    IF nullif(item->>'assigned_to','') IS NOT NULL AND (item->>'assigned_to')::uuid<>p_actor AND actor.role NOT IN ('manager','owner') THEN RAISE EXCEPTION 'Task assigned to another employee' USING ERRCODE='42501'; END IF;
    completed:=coalesce((change->>'completed')::boolean,false); evidence:=nullif(change->>'evidence_id','')::uuid;
    IF evidence IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_file_objects WHERE id=evidence AND location_id=p_location AND purpose='evidence') THEN RAISE EXCEPTION 'Invalid task evidence'; END IF;
    IF completed AND coalesce((item->>'requires_photo')::boolean,false) AND evidence IS NULL THEN RAISE EXCEPTION 'Photo evidence required'; END IF;
    IF completed AND coalesce((item->>'requires_value')::boolean,false) AND coalesce(trim(change->>'value'),'')='' THEN RAISE EXCEPTION 'Task value required'; END IF;
    items:=jsonb_set(items,ARRAY[idx::text],item||jsonb_build_object('completed',completed,'value',change->>'value','notes',coalesce(change->>'notes',''),
      'evidence_id',evidence,'completed_by',CASE WHEN completed THEN p_actor END,'completed_by_name',CASE WHEN completed THEN actor.name END,'completed_at',CASE WHEN completed THEN now() END));
  END LOOP;
  total:=jsonb_array_length(items); SELECT count(*) INTO done FROM jsonb_array_elements(items) x WHERE (x->>'completed')::boolean;
  INSERT INTO btb_shift_checks(location_id,scope_key,check_date,check_type,items,done_count,total_count,completed,notes,saved_by,saved_by_name,version)
  VALUES(p_location,p_location::text,p_date,p_kind,items,done,total,done=total AND total>0,p_notes,p_actor,actor.name,p_version+1)
  ON CONFLICT(restaurant_name,check_date,check_type,scope_key) DO UPDATE SET items=excluded.items,done_count=excluded.done_count,total_count=excluded.total_count,completed=excluded.completed,
    notes=excluded.notes,saved_by=excluded.saved_by,saved_by_name=excluded.saved_by_name,version=excluded.version,updated_at=now() RETURNING * INTO saved;
  INSERT INTO btb_check_revisions(sheet_id,version,items,notes,saved_by,saved_by_name) VALUES(saved.id,saved.version,items,p_notes,p_actor,actor.name);
  PERFORM btb_event(p_location,'checklist',saved.id,'save',p_actor,to_jsonb(current),to_jsonb(saved));
  RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.btb_platform_save_check(uuid,integer,uuid,date,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_platform_save_check(uuid,integer,uuid,date,text,integer,jsonb,text) TO service_role;

-- The read model also normalizes historical templates, but not saved instances.
CREATE OR REPLACE FUNCTION public.btb_daily_report_data(p_location uuid,p_date date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('location_id',l.id,'location',l.name,'business_date',p_date,'timezone',s.timezone,
    'checklists',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.check_type) FROM btb_shift_checks c WHERE c.location_id=l.id AND c.check_date=p_date),'[]'),
    'templates',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('tasks',btb_uncompleted_template_tasks(t.tasks))) FROM (SELECT DISTINCT ON(kind) kind,tasks,version FROM btb_operation_templates WHERE location_id=l.id AND effective_from<=p_date ORDER BY kind,effective_from DESC,version DESC) t),'[]'),
    'equipment',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'slots',e.slots) ORDER BY e.name) FROM equipment e WHERE e.location_id=l.id AND e.active_from<=p_date AND (e.retired_after IS NULL OR e.retired_after>=p_date)),'[]'),
    'temperatures',coalesce((SELECT jsonb_agg(to_jsonb(t)-'user_id' ORDER BY t.equipment_name,t.slot) FROM temperature_records t WHERE t.location_id=l.id AND t.business_date=p_date),'[]'),
    'sanitizer',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.slot) FROM btb_sanitizer_logs t WHERE t.location_id=l.id AND t.business_date=p_date),'[]'),
    'sanitizer_slots',coalesce((SELECT to_jsonb(t.slots) FROM btb_sanitizer_settings t WHERE t.location_id=l.id),'["11:00","16:00","20:00"]'))
  FROM locations l JOIN btb_location_settings s ON s.location_id=l.id WHERE l.id=p_location;
$$;
REVOKE ALL ON FUNCTION public.btb_daily_report_data(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_daily_report_data(uuid,date) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
