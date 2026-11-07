-- Release 11: scoped read models and authorization for private downloads.
BEGIN;
CREATE OR REPLACE FUNCTION btb_platform_read(p_actor uuid,p_session integer,p_location uuid,p_module text,p_date date,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees; data jsonb; current_day date;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  IF p_module='notifications' THEN
    RETURN jsonb_build_object('notifications',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (SELECT * FROM btb_notifications WHERE recipient_id=p_actor ORDER BY created_at DESC LIMIT 200) n),'[]'));
  ELSIF p_module='settings' THEN
    IF actor.role NOT IN ('corporate','owner') THEN RAISE EXCEPTION 'Corporate settings access required' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('locations',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('name',l.name,'address',l.address,'members',coalesce((SELECT jsonb_agg(a.employee_id) FROM btb_location_access a WHERE a.location_id=l.id),'[]'))) FROM btb_location_settings s JOIN locations l ON l.id=s.location_id),'[]'),
      'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'phone',phone,'role',role,'active',active,'version',version) ORDER BY name) FROM btb_employees),'[]'));
  END IF;
  actor:=btb_platform_assert(p_actor,p_session,p_location,CASE p_module WHEN 'reports' THEN 'reports' ELSE p_module||'.read' END);
  IF p_module='operations' THEN
    RETURN btb_daily_report_data(p_location,p_date)||jsonb_build_object('sanitizer_settings',(SELECT to_jsonb(s) FROM btb_sanitizer_settings s WHERE location_id=p_location),
      'team',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'role',e.role)) FROM btb_employees e JOIN btb_location_access a ON a.employee_id=e.id WHERE a.location_id=p_location AND e.active),'[]'));
  ELSIF p_module='inventory' THEN
    RETURN jsonb_build_object(
      'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.category,i.name) FROM inventory_items i WHERE location_id=p_location),'[]'),
      'counts',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM inventory_counts c WHERE location_id=p_location AND count_month=p_month),'[]'),
      'purchases',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.purchase_date,p.id) FROM inventory_purchases p WHERE location_id=p_location AND count_month=p_month),'[]'),
      'purchase_lines',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM inventory_purchase_lines l JOIN inventory_purchases p ON p.id=l.purchase_id WHERE p.location_id=p_location AND p.count_month=p_month AND p.voided_at IS NULL),'[]'),
      'imports',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FROM (SELECT * FROM btb_document_imports WHERE location_id=p_location AND accounting_month=p_month ORDER BY created_at DESC LIMIT 100) d),'[]'),
      'summary',(SELECT to_jsonb(s) FROM inventory_month_summary s WHERE location_id=p_location AND count_month=p_month),
      'snapshot',(SELECT to_jsonb(s) FROM inventory_month_snapshots s WHERE location_id=p_location AND count_month=p_month),
      'previous',(SELECT to_jsonb(s) FROM inventory_month_snapshots s WHERE location_id=p_location AND count_month=to_char((p_month||'-01')::date-interval '1 month','YYYY-MM')),
      'settings',(SELECT jsonb_build_object('sales_basis',sales_basis) FROM btb_location_settings WHERE location_id=p_location),
      'audit',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM inventory_audit_log a WHERE location_id=p_location AND count_month=p_month),'[]'));
  ELSIF p_module='marketing' THEN
    RETURN jsonb_build_object(
      'promotions',coalesce((SELECT jsonb_agg(to_jsonb(p)-'file_url' ORDER BY p.delivery_date,p.created_at) FROM marketing_promotions p WHERE location_id=p_location AND workflow_status IS NOT NULL AND (actor.role<>'designer' OR approved_at IS NOT NULL)),'[]'),
      'assets',coalesce((SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('file_name',f.name,'mime',f.mime,'byte_size',f.byte_size) ORDER BY v.version DESC) FROM btb_design_versions v JOIN marketing_promotions p ON p.id=v.promotion_id JOIN btb_file_objects f ON f.id=v.file_id WHERE p.location_id=p_location AND (actor.role<>'designer' OR p.approved_at IS NOT NULL)),'[]'),
      'comments',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM btb_promotion_comments c JOIN marketing_promotions p ON p.id=c.promotion_id WHERE p.location_id=p_location AND (actor.role<>'designer' OR p.approved_at IS NOT NULL)),'[]'),
      'history',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at) FROM btb_events e JOIN marketing_promotions p ON p.id=e.entity_id AND e.entity_type='promotion' WHERE p.location_id=p_location AND (actor.role<>'designer' OR p.approved_at IS NOT NULL)),'[]'),
      'posts',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY scheduled_at) FROM social_media_calendar c WHERE location_id=p_location AND workflow_status IS NOT NULL),'[]'),
      'formats',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY name) FROM btb_design_formats f WHERE active),'[]'),
      'platforms',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM btb_social_platforms WHERE active),'[]'),
      'designers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM btb_employees WHERE role='designer' AND active AND login_enabled),'[]'));
  ELSIF p_module='compliance' THEN
    RETURN jsonb_build_object('documents',coalesce((SELECT jsonb_agg(to_jsonb(d)-'file_url' ORDER BY expiry_date NULLS FIRST) FROM compliance_documents d WHERE location_id=p_location AND (actor.role IN ('manager','corporate','owner') OR employee_id=p_actor)),'[]'),
      'history',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC) FROM btb_compliance_versions v JOIN compliance_documents d ON d.id=v.document_id WHERE d.location_id=p_location AND (actor.role IN ('manager','corporate','owner') OR d.employee_id=p_actor)),'[]'),
      'team',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name)) FROM btb_employees e JOIN btb_location_access a ON a.employee_id=e.id WHERE a.location_id=p_location AND e.active AND (actor.role IN ('manager','corporate','owner') OR e.id=p_actor)),'[]'),
      'required_types',(SELECT to_jsonb(compliance_types) FROM btb_location_settings WHERE location_id=p_location));
  ELSIF p_module='reports' THEN
    RETURN jsonb_build_object('daily',btb_daily_report_data(p_location,p_date),'deliveries',coalesce((SELECT jsonb_agg(to_jsonb(j)-'attachment_base64'-'payload' ORDER BY j.created_at DESC) FROM (SELECT * FROM btb_email_jobs WHERE location_id=p_location ORDER BY created_at DESC LIMIT 200) j),'[]'));
  END IF;
  RAISE EXCEPTION 'Unknown module';
END $$;

CREATE OR REPLACE FUNCTION btb_platform_file_get(p_actor uuid,p_session integer,p_file uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees; file btb_file_objects; allowed boolean;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  SELECT * INTO file FROM btb_file_objects WHERE id=p_file;
  IF NOT FOUND THEN RAISE EXCEPTION 'File not found' USING ERRCODE='42501'; END IF;
  PERFORM btb_platform_assert(p_actor,p_session,file.location_id,CASE file.purpose WHEN 'reference' THEN 'marketing.read' WHEN 'artwork' THEN 'marketing.read'
    WHEN 'evidence' THEN 'operations.read' WHEN 'compliance' THEN 'compliance.read' WHEN 'purchase' THEN CASE WHEN actor.role IN ('staff','supervisor') THEN 'purchase.upload' ELSE 'inventory.read' END WHEN 'sales' THEN 'inventory.read' ELSE 'reports' END);
  allowed:=file.owner_id=p_actor;
  IF file.purpose IN ('reference','artwork') THEN
    allowed:=allowed OR EXISTS(SELECT 1 FROM marketing_promotions p WHERE p.location_id=file.location_id AND (actor.role<>'designer' OR p.approved_at IS NOT NULL)
      AND (file.id=ANY(p.reference_files) OR EXISTS(SELECT 1 FROM btb_design_versions v WHERE v.promotion_id=p.id AND v.file_id=file.id)));
  ELSIF file.purpose='compliance' THEN
    allowed:=allowed OR actor.role IN ('manager','corporate','owner') OR EXISTS(SELECT 1 FROM btb_compliance_versions v JOIN compliance_documents d ON d.id=v.document_id WHERE v.file_id=file.id AND d.employee_id=p_actor);
  ELSE allowed:=allowed OR actor.role IN ('manager','corporate','owner') OR file.purpose='evidence'; END IF;
  IF NOT allowed THEN RAISE EXCEPTION 'File not authorized' USING ERRCODE='42501'; END IF;
  RETURN to_jsonb(file);
END $$;

CREATE OR REPLACE FUNCTION btb_platform_notification_read(p_actor uuid,p_session integer,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  PERFORM btb_platform_actor(p_actor,p_session);
  UPDATE btb_notifications SET read_at=coalesce(read_at,now()) WHERE id=p_id AND recipient_id=p_actor;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION btb_platform_user(p_actor uuid,p_session integer,p_data jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current btb_employees; saved btb_employees; target_role text;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session); target_role:=p_data->>'role';
  SELECT * INTO current FROM btb_employees WHERE id=nullif(p_data->>'id','')::uuid;
  IF actor.role NOT IN ('corporate','owner') OR (actor.role='corporate' AND (target_role IN ('owner','corporate') OR current.role IN ('owner','corporate'))) THEN RAISE EXCEPTION 'User administration not authorized' USING ERRCODE='42501'; END IF;
  IF current.id=p_actor AND (target_role<>actor.role OR NOT (p_data->>'active')::boolean) THEN RAISE EXCEPTION 'Cannot deactivate yourself or change your own role'; END IF;
  SELECT * INTO saved FROM btb_save_employee(current.id,(p_data->>'version')::integer,p_data->>'name',lower(trim(p_data->>'email')),p_data->>'phone',coalesce(p_data->>'position',''),target_role,(p_data->>'active')::boolean,p_hash);
  PERFORM btb_event(NULL,'employee',saved.id,'save',p_actor,to_jsonb(current)-'email'-'phone',to_jsonb(saved)-'email'-'phone');
  RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION btb_platform_overview(p_actor uuid,p_session integer,p_date date,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees; data jsonb;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  IF actor.role NOT IN ('manager','corporate','owner') THEN RAISE EXCEPTION 'Management overview required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'timezone',s.timezone,'settings_confirmed',s.settings_confirmed,
    'checks_complete',(SELECT count(*) FROM btb_shift_checks c WHERE c.location_id=l.id AND c.check_date=p_date AND completed),
    'temperature_readings',(SELECT count(*) FROM temperature_records t WHERE t.location_id=l.id AND t.business_date=p_date),
    'sanitizer_readings',(SELECT count(*) FROM btb_sanitizer_logs t WHERE t.location_id=l.id AND t.business_date=p_date),
    'pending_approvals',(SELECT count(*) FROM marketing_promotions p WHERE p.location_id=l.id AND workflow_status='pending_approval'),
    'designs_in_progress',(SELECT count(*) FROM marketing_promotions p WHERE p.location_id=l.id AND workflow_status IN ('assigned','in_progress','revision_requested')),
    'expiring',(SELECT count(*) FROM compliance_documents d WHERE d.location_id=l.id AND d.expiry_date BETWEEN p_date AND p_date+60),
    'expired',(SELECT count(*) FROM compliance_documents d WHERE d.location_id=l.id AND d.expiry_date<p_date),
    'missing',(SELECT count(*) FROM compliance_documents d WHERE d.location_id=l.id AND (d.file_id IS NULL OR d.expiry_date IS NULL)),
    'email_accepted',(SELECT count(*) FROM btb_email_jobs j WHERE j.location_id=l.id AND j.business_date=p_date AND status='accepted'),
    'email_failed',(SELECT count(*) FROM btb_email_jobs j WHERE j.location_id=l.id AND j.business_date=p_date AND status='failed'),
    'inventory',(SELECT to_jsonb(i)-'item_snapshot' FROM inventory_month_snapshots i WHERE i.location_id=l.id AND i.count_month=p_month)
  ) ORDER BY l.name),'[]') INTO data FROM locations l JOIN btb_location_settings s ON s.location_id=l.id WHERE s.active AND
  (actor.role IN ('corporate','owner') OR EXISTS(SELECT 1 FROM btb_location_access a WHERE a.employee_id=p_actor AND a.location_id=l.id));
  RETURN jsonb_build_object('locations',data);
END $$;

DO $$ DECLARE f record; BEGIN
  GRANT SELECT,INSERT,UPDATE ON locations TO service_role;
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'btb_platform_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
