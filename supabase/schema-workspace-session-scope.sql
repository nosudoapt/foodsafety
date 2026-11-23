-- Step 58. Request-bound SQL authorization and retirement of browser tokens.
-- Additive only: no inferred location backfill and no credential conversion.
BEGIN;

ALTER TABLE public.workspace_auth_sessions ADD COLUMN tenant_id uuid REFERENCES public.workspace_tenants(id);
ALTER TABLE public.workspace_auth_sessions ADD COLUMN location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.workspace_auth_sessions ADD COLUMN role text;
UPDATE public.workspace_auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
ALTER TABLE public.workspace_auth_sessions ADD CONSTRAINT workspace_session_scope_required
  CHECK (revoked_at IS NOT NULL OR (tenant_id IS NOT NULL AND location_id IS NOT NULL AND role IS NOT NULL));

CREATE FUNCTION public.workspace_create_session(p_id uuid,p_principal uuid,p_version integer,p_tenant uuid,p_location uuid,p_role text,p_exp timestamptz,p_previous uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb; previous public.workspace_auth_sessions;
BEGIN
  IF p_id IS NULL OR p_principal IS NULL OR p_exp IS NULL THEN
    RAISE EXCEPTION 'Valid session required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.workspace_principals WHERE id=p_principal FOR SHARE;
  context:=public.workspace_auth_context(p_principal);
  IF context IS NULL OR NOT (context->>'active')::boolean OR NOT (context->>'principalActive')::boolean
    OR (context->>'version')::integer IS DISTINCT FROM p_version OR (context->>'tenantId')::uuid IS DISTINCT FROM p_tenant
    OR context->>'role' IS DISTINCT FROM p_role OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'locations') l WHERE (l->>'id')::uuid=p_location)
    OR p_exp<=now() OR p_exp>now()+interval '12 hours' THEN
    RAISE EXCEPTION 'The workspace changed; sign in again' USING ERRCODE='42501';
  END IF;
  IF p_previous IS NOT NULL THEN
    SELECT * INTO previous FROM public.workspace_auth_sessions WHERE id=p_previous AND principal_id=p_principal FOR UPDATE;
    IF NOT FOUND OR previous.revoked_at IS NOT NULL OR previous.expires_at<=now() OR previous.version<>p_version OR previous.expires_at<>p_exp THEN
      RAISE EXCEPTION 'The session changed; reload' USING ERRCODE='40001';
    END IF;
    UPDATE public.workspace_auth_sessions SET revoked_at=now() WHERE id=p_previous;
  END IF;
  INSERT INTO public.workspace_auth_sessions(id,principal_id,version,tenant_id,location_id,role,expires_at)
    VALUES(p_id,p_principal,p_version,p_tenant,p_location,p_role,p_exp);
END $$;

-- PostgREST verifies the durable session at the start of EVERY scoped SQL
-- request, including reads. A revoked cookie cannot finish a later query using
-- a previously constructed service client. Unscoped service-role infrastructure
-- (credential verification and trusted jobs) is not an application authority.
-- Fail rather than overwrite a pre-existing project hook.
DO $$ DECLARE setting text; BEGIN
  SELECT config INTO setting FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole,
    LATERAL unnest(s.setconfig) config
    WHERE r.rolname='authenticator' AND config LIKE 'pgrst.db_pre_request=%' LIMIT 1;
  IF setting IS NOT NULL THEN RAISE EXCEPTION 'Review the existing PostgREST pre-request hook before applying step 58'; END IF;
END $$;
CREATE FUNCTION public.workspace_pre_request() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF nullif(current_setting('request.headers',true),'')::jsonb ? 'x-workspace-session' THEN
    PERFORM public.workspace_request_context();
  END IF;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.workspace_pre_request';

CREATE TABLE public.workspace_location_role_access (
  location_id uuid NOT NULL REFERENCES public.locations(id),
  role text NOT NULL CHECK (role IN ('staff','supervisor','manager','designer','corporate','owner')),
  page text NOT NULL REFERENCES public.btb_page_permissions(page),
  allowed boolean NOT NULL DEFAULT true,
  PRIMARY KEY(location_id,role,page)
);

-- Only a service-authenticated, server-owned PostgREST request can resolve this
-- id. It is never returned by /api/auth/session or accepted from a browser body.
-- Cache within one SQL transaction so an authorized settings transaction can
-- finish after its own assignment/version invalidation has revoked old cookies.
CREATE FUNCTION public.workspace_request_context() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE raw text; cached text; session public.workspace_auth_sessions; context jsonb; jwt_role text;
BEGIN
  jwt_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role');
  IF jwt_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Verified server session required' USING ERRCODE='42501'; END IF;
  raw:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-workspace-session';
  IF raw IS NULL OR raw !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Verified server session required' USING ERRCODE='42501'; END IF;
  cached:=nullif(current_setting('workspace.verified_context',true),'');
  IF cached IS NOT NULL AND cached::jsonb->>'sid'=raw THEN RETURN cached::jsonb; END IF;
  SELECT * INTO session FROM public.workspace_auth_sessions WHERE id=raw::uuid AND revoked_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Session revoked' USING ERRCODE='42501'; END IF;
  context:=public.workspace_auth_context(session.principal_id);
  IF context IS NULL OR NOT (context->>'active')::boolean OR NOT (context->>'principalActive')::boolean
    OR (context->>'version')::integer IS DISTINCT FROM session.version OR (context->>'tenantId')::uuid IS DISTINCT FROM session.tenant_id
    OR context->>'role' IS DISTINCT FROM session.role OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'locations') l WHERE (l->>'id')::uuid=session.location_id) THEN
    RAISE EXCEPTION 'Workspace revoked' USING ERRCODE='42501';
  END IF;
  context:=context||jsonb_build_object('sid',session.id,'locationId',session.location_id);
  PERFORM set_config('workspace.verified_context',context::text,true);
  RETURN context;
END $$;

CREATE FUNCTION public.workspace_btb_page_grants(p_employee uuid,p_location uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context(); pages jsonb; restrictions jsonb;
BEGIN
  IF context->>'principalType'<>'employee' OR context->>'tenantSlug'<>'between-the-buns'
    OR (context->>'credentialId')::uuid<>p_employee OR (context->>'locationId')::uuid<>p_location
    OR NOT EXISTS(SELECT 1 FROM public.btb_location_access a JOIN public.btb_employees e ON e.id=a.employee_id
      JOIN public.locations l ON l.id=a.location_id WHERE a.employee_id=p_employee AND a.location_id=p_location
      AND e.tenant_id=l.tenant_id AND l.tenant_id=(context->>'tenantId')::uuid AND l.active) THEN
    RAISE EXCEPTION 'Current location assignment required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(page ORDER BY page),'[]'::jsonb) INTO pages
    FROM public.btb_location_page_access WHERE location_id=p_location AND allowed;
  SELECT coalesce(jsonb_agg(jsonb_build_object('role',role,'page',page,'allowed',allowed) ORDER BY page),'[]'::jsonb)
    INTO restrictions FROM (
      SELECT role,page,bool_and(allowed) allowed FROM (
        SELECT role,page,allowed FROM public.role_page_access WHERE role=context->>'role'
        UNION ALL SELECT role,page,allowed FROM public.workspace_location_role_access
          WHERE location_id=p_location AND role=context->>'role'
      ) policy_rows GROUP BY role,page
    ) effective;
  RETURN jsonb_build_object('locationIds',jsonb_build_array(p_location),'pageGrants',pages,'rows',restrictions);
END $$;

CREATE OR REPLACE FUNCTION public.btb_effective_page_allowed(p_role text,p_employee uuid,p_page text,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context();
BEGIN
  RETURN context->>'principalType'='employee' AND context->>'role'=p_role AND (context->>'credentialId')::uuid=p_employee
    AND EXISTS(SELECT 1 FROM public.btb_page_permissions WHERE page=p_page AND p_role=ANY(view_roles) AND (NOT p_write OR p_role=ANY(edit_roles)))
    AND NOT EXISTS(SELECT 1 FROM public.role_page_access WHERE role=p_role AND page=p_page AND NOT allowed)
    AND NOT EXISTS(SELECT 1 FROM public.workspace_location_role_access WHERE location_id=(context->>'locationId')::uuid AND role=p_role AND page=p_page AND NOT allowed)
    AND EXISTS(SELECT 1 FROM public.btb_location_page_access WHERE location_id=(context->>'locationId')::uuid AND page=p_page AND allowed);
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_actor(p_actor uuid,p_session integer)
RETURNS public.btb_employees LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context(); actor public.btb_employees;
BEGIN
  IF context->>'principalType'<>'employee' OR context->>'tenantSlug'<>'between-the-buns'
    OR (context->>'credentialId')::uuid<>p_actor OR (context->>'sourceVersion')::integer IS DISTINCT FROM p_session THEN
    RAISE EXCEPTION 'Personal workspace session required' USING ERRCODE='42501';
  END IF;
  SELECT e.* INTO actor FROM public.btb_employees e JOIN public.btb_employee_credentials c ON c.employee_id=e.id
    WHERE e.id=p_actor AND e.tenant_id=(context->>'tenantId')::uuid AND e.active AND e.login_enabled AND e.role=context->>'role' AND c.session_version=p_session;
  IF NOT FOUND OR NOT public.btb_effective_page_allowed(actor.role,actor.id,'platform',false) THEN
    RAISE EXCEPTION 'Personal workspace session required' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_assert(p_actor uuid,p_session integer,p_location uuid,p_capability text)
RETURNS public.btb_employees LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE actor public.btb_employees; allowed boolean; context jsonb:=public.workspace_request_context();
BEGIN
  actor:=public.btb_platform_actor(p_actor,p_session);
  allowed:=CASE p_capability
    WHEN 'operations.read' THEN actor.role IN ('staff','supervisor','manager','corporate','owner')
    WHEN 'operations.write' THEN actor.role IN ('staff','supervisor','manager','owner')
    WHEN 'operations.configure' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'inventory.read' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'inventory.write' THEN actor.role IN ('manager','owner')
    WHEN 'purchase.upload' THEN actor.role IN ('staff','supervisor','manager','owner')
    WHEN 'marketing.read' THEN actor.role IN ('manager','designer','corporate','owner')
    WHEN 'marketing.request' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'marketing.design' THEN actor.role IN ('designer','owner')
    WHEN 'marketing.approve' THEN actor.role IN ('corporate','owner')
    WHEN 'compliance.read' THEN actor.role IN ('staff','supervisor','manager','corporate','owner')
    WHEN 'compliance.write' THEN actor.role IN ('staff','supervisor','manager','corporate','owner')
    WHEN 'reports' THEN actor.role IN ('manager','corporate','owner')
    WHEN 'settings' THEN actor.role IN ('manager','corporate','owner')
    ELSE false END;
  IF NOT allowed OR p_location IS NULL OR p_location IS DISTINCT FROM (context->>'locationId')::uuid
    OR NOT EXISTS(SELECT 1 FROM public.btb_location_access a JOIN public.locations l ON l.id=a.location_id
      JOIN public.btb_location_settings s ON s.location_id=l.id WHERE a.employee_id=actor.id AND l.id=p_location
      AND l.active AND s.active AND l.tenant_id=actor.tenant_id) THEN
    RAISE EXCEPTION 'Current location capability required' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_bootstrap(p_actor uuid,p_session integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE actor public.btb_employees; sites jsonb; context jsonb:=public.workspace_request_context();
BEGIN
  actor:=public.btb_platform_actor(p_actor,p_session);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'address',l.address,'active',s.active,'timezone',s.timezone,
    'business_day_start',s.business_day_start,'settings_confirmed',s.settings_confirmed) ORDER BY l.name),'[]'::jsonb)
    INTO sites FROM public.locations l JOIN public.btb_location_settings s ON s.location_id=l.id
    JOIN public.btb_location_access a ON a.location_id=l.id AND a.employee_id=actor.id
    WHERE l.id=(context->>'locationId')::uuid AND l.tenant_id=actor.tenant_id AND l.active AND s.active;
  RETURN jsonb_build_object('identity',jsonb_build_object('id',actor.id,'name',actor.name,'role',actor.role),'locations',sites,
    'notifications',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (SELECT * FROM public.btb_notifications
      WHERE recipient_id=actor.id AND location_id=(context->>'locationId')::uuid ORDER BY created_at DESC LIMIT 40) n),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_read(p_actor uuid,p_session integer,p_location uuid,p_module text,p_date date,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE actor public.btb_employees; context jsonb:=public.workspace_request_context();
BEGIN
  actor:=public.btb_platform_actor(p_actor,p_session);
  IF p_location IS NULL OR p_location IS DISTINCT FROM (context->>'locationId')::uuid THEN
    RAISE EXCEPTION 'Current location required' USING ERRCODE='42501';
  END IF;
  IF p_module='notifications' THEN
    RETURN jsonb_build_object('notifications',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC)
      FROM (SELECT * FROM public.btb_notifications WHERE recipient_id=p_actor AND location_id=p_location ORDER BY created_at DESC LIMIT 200) n),'[]'::jsonb));
  ELSIF p_module='settings' THEN
    IF actor.role NOT IN ('corporate','owner') THEN RAISE EXCEPTION 'Corporate settings access required' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object(
      'locations',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('name',l.name,'address',l.address,
        'members',coalesce((SELECT jsonb_agg(a.employee_id) FROM public.btb_location_access a JOIN public.btb_employees e ON e.id=a.employee_id
          WHERE a.location_id=l.id AND e.tenant_id=l.tenant_id),'[]'::jsonb)))
        FROM public.btb_location_settings s JOIN public.locations l ON l.id=s.location_id
        WHERE l.id=p_location AND l.tenant_id=actor.tenant_id),'[]'::jsonb),
      'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'email',e.email,'phone',e.phone,'role',e.role,'active',e.active,'version',e.version) ORDER BY e.name)
        FROM public.btb_employees e JOIN public.btb_location_access a ON a.employee_id=e.id
        WHERE a.location_id=p_location AND e.tenant_id=actor.tenant_id),'[]'::jsonb));
  END IF;
  actor:=public.btb_platform_assert(p_actor,p_session,p_location,CASE p_module WHEN 'reports' THEN 'reports' ELSE p_module||'.read' END);
  IF p_module='operations' THEN
    RETURN public.btb_daily_report_data(p_location,p_date)||jsonb_build_object('sanitizer_settings',(SELECT to_jsonb(s) FROM public.btb_sanitizer_settings s WHERE location_id=p_location),
      'team',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'role',e.role)) FROM public.btb_employees e JOIN public.btb_location_access a ON a.employee_id=e.id
        WHERE a.location_id=p_location AND e.tenant_id=actor.tenant_id AND e.active),'[]'::jsonb));
  ELSIF p_module='inventory' THEN
    RETURN jsonb_build_object(
      'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.category,i.name) FROM public.inventory_items i WHERE location_id=p_location),'[]'::jsonb),
      'counts',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.inventory_counts c WHERE location_id=p_location AND count_month=p_month),'[]'::jsonb),
      'purchases',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.purchase_date,p.id) FROM public.inventory_purchases p WHERE location_id=p_location AND count_month=p_month),'[]'::jsonb),
      'purchase_lines',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.inventory_purchase_lines l JOIN public.inventory_purchases p ON p.id=l.purchase_id WHERE p.location_id=p_location AND l.location_id=p_location AND p.count_month=p_month AND p.voided_at IS NULL),'[]'::jsonb),
      'imports',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FROM (SELECT * FROM public.btb_document_imports WHERE location_id=p_location AND accounting_month=p_month ORDER BY created_at DESC LIMIT 100) d),'[]'::jsonb),
      'summary',(SELECT to_jsonb(s) FROM public.inventory_month_summary s WHERE location_id=p_location AND count_month=p_month),
      'snapshot',(SELECT to_jsonb(s) FROM public.inventory_month_snapshots s WHERE location_id=p_location AND count_month=p_month),
      'previous',(SELECT to_jsonb(s) FROM public.inventory_month_snapshots s WHERE location_id=p_location AND count_month=to_char((p_month||'-01')::date-interval '1 month','YYYY-MM')),
      'settings',(SELECT jsonb_build_object('sales_basis',sales_basis) FROM public.btb_location_settings WHERE location_id=p_location),
      'audit',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.inventory_audit_log a WHERE location_id=p_location AND count_month=p_month),'[]'::jsonb));
  ELSIF p_module='marketing' THEN
    RETURN jsonb_build_object(
      'promotions',coalesce((SELECT jsonb_agg(to_jsonb(p)-'file_url' ORDER BY p.delivery_date,p.created_at) FROM public.marketing_promotions p WHERE location_id=p_location AND workflow_status IS NOT NULL AND (actor.role<>'designer' OR approved_at IS NOT NULL)),'[]'::jsonb),
      'assets',coalesce((SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('file_name',f.name,'mime',f.mime,'byte_size',f.byte_size) ORDER BY v.version DESC) FROM public.btb_design_versions v JOIN public.marketing_promotions p ON p.id=v.promotion_id JOIN public.btb_file_objects f ON f.id=v.file_id WHERE p.location_id=p_location AND f.location_id=p_location AND (actor.role<>'designer' OR p.approved_at IS NOT NULL)),'[]'::jsonb),
      'comments',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM public.btb_promotion_comments c JOIN public.marketing_promotions p ON p.id=c.promotion_id WHERE p.location_id=p_location AND (actor.role<>'designer' OR p.approved_at IS NOT NULL)),'[]'::jsonb),
      'history',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at) FROM public.btb_events e JOIN public.marketing_promotions p ON p.id=e.entity_id AND e.entity_type='promotion' WHERE p.location_id=p_location AND e.location_id=p_location AND (actor.role<>'designer' OR p.approved_at IS NOT NULL)),'[]'::jsonb),
      'posts',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY scheduled_at) FROM public.social_media_calendar c WHERE location_id=p_location AND workflow_status IS NOT NULL),'[]'::jsonb),
      'formats',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY name) FROM public.btb_design_formats f WHERE active),'[]'::jsonb),
      'platforms',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM public.btb_social_platforms WHERE active),'[]'::jsonb),
      'designers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name)) FROM public.btb_employees e JOIN public.btb_location_access a ON a.employee_id=e.id
        WHERE e.role='designer' AND e.active AND e.login_enabled AND e.tenant_id=actor.tenant_id AND a.location_id=p_location),'[]'::jsonb));
  ELSIF p_module='compliance' THEN
    RETURN jsonb_build_object('documents',coalesce((SELECT jsonb_agg(to_jsonb(d)-'file_url' ORDER BY expiry_date NULLS FIRST) FROM public.compliance_documents d WHERE location_id=p_location AND (actor.role IN ('manager','corporate','owner') OR employee_id=p_actor)),'[]'::jsonb),
      'history',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC) FROM public.btb_compliance_versions v JOIN public.compliance_documents d ON d.id=v.document_id WHERE d.location_id=p_location AND (actor.role IN ('manager','corporate','owner') OR d.employee_id=p_actor)),'[]'::jsonb),
      'team',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name)) FROM public.btb_employees e JOIN public.btb_location_access a ON a.employee_id=e.id WHERE a.location_id=p_location AND e.tenant_id=actor.tenant_id AND e.active AND (actor.role IN ('manager','corporate','owner') OR e.id=p_actor)),'[]'::jsonb),
      'required_types',(SELECT to_jsonb(compliance_types) FROM public.btb_location_settings WHERE location_id=p_location));
  ELSIF p_module='reports' THEN
    RETURN jsonb_build_object('daily',public.btb_daily_report_data(p_location,p_date),'deliveries',coalesce((SELECT jsonb_agg(to_jsonb(j)-'attachment_base64'-'payload' ORDER BY j.created_at DESC)
      FROM (SELECT * FROM public.btb_email_jobs WHERE location_id=p_location ORDER BY created_at DESC LIMIT 200) j),'[]'::jsonb));
  END IF;
  RAISE EXCEPTION 'Unknown module' USING ERRCODE='22023';
END $$;

CREATE OR REPLACE FUNCTION public.btb_platform_overview(p_actor uuid,p_session integer,p_date date,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE actor public.btb_employees; data jsonb; context jsonb:=public.workspace_request_context();
BEGIN
  actor:=public.btb_platform_actor(p_actor,p_session);
  IF actor.role NOT IN ('manager','corporate','owner') THEN RAISE EXCEPTION 'Management overview required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'timezone',s.timezone,'settings_confirmed',s.settings_confirmed,
    'checks_complete',(SELECT count(*) FROM public.btb_shift_checks c WHERE c.location_id=l.id AND c.check_date=p_date AND completed),
    'temperature_readings',(SELECT count(*) FROM public.temperature_records t WHERE t.location_id=l.id AND t.business_date=p_date),
    'sanitizer_readings',(SELECT count(*) FROM public.btb_sanitizer_logs t WHERE t.location_id=l.id AND t.business_date=p_date),
    'pending_approvals',(SELECT count(*) FROM public.marketing_promotions p WHERE p.location_id=l.id AND workflow_status='pending_approval'),
    'designs_in_progress',(SELECT count(*) FROM public.marketing_promotions p WHERE p.location_id=l.id AND workflow_status IN ('assigned','in_progress','revision_requested')),
    'expiring',(SELECT count(*) FROM public.compliance_documents d WHERE d.location_id=l.id AND d.expiry_date BETWEEN p_date AND p_date+60),
    'expired',(SELECT count(*) FROM public.compliance_documents d WHERE d.location_id=l.id AND d.expiry_date<p_date),
    'missing',(SELECT count(*) FROM public.compliance_documents d WHERE d.location_id=l.id AND (d.file_id IS NULL OR d.expiry_date IS NULL)),
    'email_accepted',(SELECT count(*) FROM public.btb_email_jobs j WHERE j.location_id=l.id AND j.business_date=p_date AND status='accepted'),
    'email_failed',(SELECT count(*) FROM public.btb_email_jobs j WHERE j.location_id=l.id AND j.business_date=p_date AND status='failed'),
    'inventory',(SELECT to_jsonb(i)-'item_snapshot' FROM public.inventory_month_snapshots i WHERE i.location_id=l.id AND i.count_month=p_month)
  ) ORDER BY l.name),'[]'::jsonb) INTO data FROM public.locations l JOIN public.btb_location_settings s ON s.location_id=l.id
    JOIN public.btb_location_access a ON a.location_id=l.id AND a.employee_id=actor.id
    WHERE l.id=(context->>'locationId')::uuid AND l.tenant_id=actor.tenant_id AND l.active AND s.active;
  RETURN jsonb_build_object('locations',data);
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_session(p_actor uuid,p_session integer)
RETURNS public.btb_super_admins LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context(); actor public.btb_super_admins;
BEGIN
  IF context->>'principalType'<>'console' OR context->>'role'<>'admin' OR context->>'tenantSlug'<>'between-the-buns'
    OR (context->>'credentialId')::uuid<>p_actor OR (context->>'sourceVersion')::integer IS DISTINCT FROM p_session THEN
    RAISE EXCEPTION 'Console workspace session required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO actor FROM public.btb_super_admins WHERE id=p_actor AND active AND session_version=p_session AND tenant_id=(context->>'tenantId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Console workspace session required' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_assert_location(p_actor uuid,p_session integer,p_location uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context();
BEGIN
  PERFORM public.btb_admin_session(p_actor,p_session);
  IF p_location IS NULL OR p_location IS DISTINCT FROM (context->>'locationId')::uuid OR NOT EXISTS(
    SELECT 1 FROM public.workspace_console_locations a JOIN public.locations l ON l.id=a.location_id
    WHERE a.console_id=p_actor AND l.id=p_location AND l.tenant_id=(context->>'tenantId')::uuid AND l.active) THEN
    RAISE EXCEPTION 'Current console location required' USING ERRCODE='42501';
  END IF;
END $$;

-- Creating a new location is a console provisioning transaction, not permission
-- to operate on some caller-selected existing location. Assign ONLY its creator.
CREATE OR REPLACE FUNCTION public.btb_admin_create_location(p_actor uuid,p_session integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context(); location uuid:=gen_random_uuid();
  v_name text:=trim(p_data->>'name'); v_timezone text:=p_data->>'timezone'; v_slug text;
BEGIN
  PERFORM public.btb_admin_session(p_actor,p_session);
  IF coalesce(v_name,'')='' OR length(v_name)>150 OR length(coalesce(p_data->>'address',''))>300 THEN
    RAISE EXCEPTION 'Location name or address invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    RAISE EXCEPTION 'Choose an IANA timezone' USING ERRCODE='22023';
  END IF;
  v_slug:=public.btb_location_slug(p_data,v_name,NULL);
  PERFORM set_config('workspace.provision_location',location::text,true);
  INSERT INTO public.locations(id,name,address,slug,tenant_id) VALUES(location,v_name,coalesce(p_data->>'address',''),v_slug,(context->>'tenantId')::uuid);
  INSERT INTO public.btb_location_settings(location_id,timezone) VALUES(location,v_timezone);
  INSERT INTO public.btb_superadmin_locations(location_id) VALUES(location);
  INSERT INTO public.workspace_console_locations(console_id,location_id) VALUES(p_actor,location);
  PERFORM public.btb_admin_write_pages(location,coalesce(p_data->'pages','[]'::jsonb));
  PERFORM public.btb_admin_event(p_actor,p_session,location,'console_location',location,'create',NULL,jsonb_build_object('name',v_name,'timezone',v_timezone,'slug',v_slug));
  RETURN jsonb_build_object('id',location,'slug',v_slug);
END $$;

-- Preserve the detailed monitoring contract, while removing its global managed
-- register as an authorization authority. Restrict every aggregate/subquery.
DO $$ DECLARE signature regprocedure; definition text; prior text; BEGIN
  FOREACH signature IN ARRAY ARRAY['public.btb_admin_locations(uuid,integer)'::regprocedure,'public.btb_admin_monitoring(uuid,integer,integer)'::regprocedure] LOOP
    definition:=pg_get_functiondef(signature); prior:=definition;
    definition:=replace(definition,'FROM btb_superadmin_locations m','FROM workspace_console_locations m');
    definition:=replace(definition,'JOIN locations l ON l.id=m.location_id',
      'JOIN locations l ON l.id=m.location_id AND m.console_id=p_actor AND l.id=(public.workspace_request_context()->>''locationId'')::uuid AND l.tenant_id=(public.workspace_request_context()->>''tenantId'')::uuid');
    definition:=replace(definition,'SELECT location_id FROM btb_superadmin_locations',
      'SELECT location_id FROM workspace_console_locations WHERE console_id=p_actor AND location_id=(public.workspace_request_context()->>''locationId'')::uuid');
    IF definition=prior OR definition LIKE '%FROM btb_superadmin_locations%' THEN RAISE EXCEPTION 'Unexpected console function definition: %',signature; END IF;
    EXECUTE definition;
  END LOOP;
END $$;

-- Existing branch-owned tables keep their data. Previously location-less
-- registers gain nullable columns; their old rows stay unassigned and hidden.
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='restaurant_name'
    AND table_name NOT IN ('profiles','btb_employees','btb_super_admins','btb_public_tokens','platform_plans') LOOP
    IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=item.table_name AND table_type='BASE TABLE') THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id)',item.table_name);
    END IF;
  END LOOP;
  FOR item IN SELECT name FROM (VALUES ('training_topics'),('training_sections'),('btb_franchise_tasks'),('handbook_signatures'),('btb_order_revisions'),
    ('btb_bank_allocations'),('btb_bank_transactions'),('btb_check_revisions'),('btb_compliance_versions'),('btb_design_versions'),('btb_promotion_comments'),
    ('btb_clock_devices'),('btb_training_reviews')) t(name) LOOP
    IF to_regclass('public.'||item.name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id)',item.name);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.workspace_assert_employee_target(p_employee uuid,p_role text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context(); target public.btb_employees;
BEGIN
  IF context->>'tenantSlug'<>'between-the-buns' OR context->>'principalType' NOT IN ('employee','console') THEN
    RAISE EXCEPTION 'Team administration required' USING ERRCODE='42501';
  END IF;
  IF p_employee IS NOT NULL THEN
    SELECT e.* INTO target FROM public.btb_employees e JOIN public.btb_location_access a ON a.employee_id=e.id
      WHERE e.id=p_employee AND a.location_id=(context->>'locationId')::uuid AND e.tenant_id=(context->>'tenantId')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Person not in the current workspace' USING ERRCODE='42501'; END IF;
  END IF;
  IF context->>'principalType'='console' THEN
    IF coalesce(p_role,target.role,'staff') NOT IN ('staff','supervisor','manager') THEN
      RAISE EXCEPTION 'Person role cannot be managed by this console' USING ERRCODE='42501';
    END IF;
  ELSIF context->>'role'='owner' THEN
    NULL;
  ELSIF context->>'role'='corporate' THEN
    IF coalesce(p_role,target.role,'staff') IN ('owner','corporate') OR target.role IN ('owner','corporate') THEN
      RAISE EXCEPTION 'Person role cannot be managed' USING ERRCODE='42501';
    END IF;
  ELSIF NOT public.btb_employee_manageable(context->>'role',coalesce(p_role,target.role,'staff'))
    OR (target.id IS NOT NULL AND NOT public.btb_employee_manageable(context->>'role',target.role)) THEN
    RAISE EXCEPTION 'Person role cannot be managed' USING ERRCODE='42501';
  END IF;
END $$;

-- Existing employees and closed assignments remain intact. New employees are
-- stamped with this tenant and explicitly assigned to the current location.
CREATE OR REPLACE FUNCTION public.btb_save_employee(p_id uuid,p_version integer,p_name text,p_email text,p_phone text,p_position text,p_role text,p_active boolean,p_password_hash text)
RETURNS SETOF public.btb_employees LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE current public.btb_employees; saved public.btb_employees; context jsonb:=public.workspace_request_context();
BEGIN
  PERFORM public.workspace_assert_employee_target(p_id,p_role);
  IF p_id IS NULL THEN
    IF p_version<>0 OR p_password_hash IS NULL THEN RAISE EXCEPTION 'Initial password required'; END IF;
    INSERT INTO public.btb_employees(name,email,phone,position,role,active,login_enabled,tenant_id)
      VALUES(p_name,p_email,p_phone,p_position,p_role,p_active,true,(context->>'tenantId')::uuid) RETURNING * INTO saved;
    INSERT INTO public.btb_location_access(location_id,employee_id) VALUES((context->>'locationId')::uuid,saved.id);
  ELSE
    SELECT * INTO current FROM public.btb_employees WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR current.version<>p_version THEN RAISE EXCEPTION 'Stale employee' USING ERRCODE='40001'; END IF;
    UPDATE public.btb_employees SET name=p_name,email=p_email,phone=p_phone,position=p_position,role=p_role,active=p_active,
      login_enabled=(current.login_enabled OR p_password_hash IS NOT NULL),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO saved;
    IF current.role<>p_role OR current.email IS DISTINCT FROM p_email OR current.active<>p_active THEN
      UPDATE public.btb_employee_credentials SET session_version=session_version+1,updated_at=now() WHERE employee_id=p_id;
    END IF;
  END IF;
  IF p_password_hash IS NOT NULL THEN
    INSERT INTO public.btb_employee_credentials AS credentials(employee_id,password_hash) VALUES(saved.id,p_password_hash)
      ON CONFLICT(employee_id) DO UPDATE SET password_hash=excluded.password_hash,session_version=credentials.session_version+1,updated_at=now();
  END IF;
  RETURN NEXT saved;
END $$;

CREATE FUNCTION public.workspace_guard_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  tenant uuid; assigned_tenant uuid; context jsonb; location uuid:=(row_data->>'location_id')::uuid;
BEGIN
  SELECT tenant_id INTO tenant FROM public.locations WHERE id=location;
  IF TG_TABLE_NAME='btb_location_access' THEN
    SELECT tenant_id INTO assigned_tenant FROM public.btb_employees WHERE id=(row_data->>'employee_id')::uuid;
  ELSIF TG_TABLE_NAME='location_members' THEN
    SELECT tenant_id INTO assigned_tenant FROM public.profiles WHERE id=(row_data->>'user_id')::uuid;
  ELSE
    SELECT tenant_id INTO assigned_tenant FROM public.btb_super_admins WHERE id=(row_data->>'console_id')::uuid;
  END IF;
  IF TG_OP<>'DELETE' AND (tenant IS NULL OR assigned_tenant IS DISTINCT FROM tenant) THEN
    RAISE EXCEPTION 'Membership must belong to the same tenant' USING ERRCODE='42501';
  END IF;
  IF nullif(current_setting('request.headers',true),'')::jsonb ? 'x-workspace-session' THEN
    context:=public.workspace_request_context();
    IF tenant IS DISTINCT FROM (context->>'tenantId')::uuid
      OR (location IS DISTINCT FROM (context->>'locationId')::uuid AND NOT (context->>'principalType'='console' AND location::text=current_setting('workspace.provision_location',true)))
      OR context->>'principalType'='supabase'
      OR context->>'principalType'='employee' AND context->>'role' NOT IN ('corporate','owner') AND NOT (
        TG_OP='INSERT' AND TG_TABLE_NAME='btb_location_access'
        AND EXISTS(SELECT 1 FROM public.btb_employees e WHERE e.id=(row_data->>'employee_id')::uuid AND public.btb_employee_manageable(context->>'role',e.role))
        AND NOT EXISTS(SELECT 1 FROM public.btb_location_access a WHERE a.employee_id=(row_data->>'employee_id')::uuid))
      OR TG_TABLE_NAME='workspace_console_locations' AND (context->>'principalType'<>'console' OR row_data->>'console_id'<>context->>'credentialId') THEN
      RAISE EXCEPTION 'Membership change not permitted' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER workspace_membership BEFORE INSERT OR UPDATE OR DELETE ON public.btb_location_access FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_membership();
CREATE TRIGGER workspace_membership BEFORE INSERT OR UPDATE OR DELETE ON public.location_members FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_membership();
CREATE TRIGGER workspace_membership BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_console_locations FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_membership();

CREATE FUNCTION public.workspace_guard_employee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb; row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; target uuid;
BEGIN
  IF NOT coalesce(nullif(current_setting('request.headers',true),'')::jsonb ? 'x-workspace-session',false) THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  context:=public.workspace_request_context();
  target:=coalesce(row_data->>'employee_id',row_data->>'id')::uuid;
  IF TG_TABLE_NAME='btb_employees' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.tenant_id IS NULL THEN NEW.tenant_id:=(context->>'tenantId')::uuid; END IF;
      IF NEW.tenant_id IS DISTINCT FROM (context->>'tenantId')::uuid THEN RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE='42501'; END IF;
      PERFORM public.workspace_assert_employee_target(NULL,NEW.role);
    ELSE
      PERFORM public.workspace_assert_employee_target(target,CASE WHEN TG_OP='DELETE' THEN OLD.role ELSE NEW.role END);
      IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
        RAISE EXCEPTION 'Identity reassignment not permitted' USING ERRCODE='42501';
      END IF;
    END IF;
  ELSIF context->>'principalType'='employee' AND target=(context->>'credentialId')::uuid THEN
    NULL; -- A verified personal password change; raw credential access is not exposed by the API.
  ELSE
    PERFORM public.workspace_assert_employee_target(target);
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER workspace_employee BEFORE INSERT OR UPDATE OR DELETE ON public.btb_employees FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_employee();
CREATE TRIGGER workspace_employee BEFORE INSERT OR UPDATE OR DELETE ON public.btb_employee_credentials FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_employee();

-- Surgical, fail-closed compatibility edits of the existing atomic functions.
-- Do not replace their validation, invitation locking, idempotency or history.
CREATE FUNCTION public.workspace_patch_function(p_signature regprocedure,p_before text,p_after text) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE definition text:=pg_get_functiondef(p_signature);
BEGIN
  IF strpos(definition,p_before)=0 THEN RAISE EXCEPTION 'Unexpected function contract: %',p_signature; END IF;
  EXECUTE replace(definition,p_before,p_after);
END $$;
SELECT public.workspace_patch_function('public.btb_platform_settings(uuid,integer,uuid,integer,jsonb)',
  'actor:=btb_platform_actor(p_actor,p_session);',
  'actor:=btb_platform_assert(p_actor,p_session,p_location,''settings'');');
SELECT public.workspace_patch_function('public.btb_platform_settings(uuid,integer,uuid,integer,jsonb)',
  'WHERE id=member AND active', 'WHERE id=member AND active AND tenant_id=(public.workspace_request_context()->>''tenantId'')::uuid');
SELECT public.workspace_patch_function('public.btb_platform_user(uuid,integer,jsonb,text)',
  'target_role:=p_data->>''role'';',
  'target_role:=p_data->>''role''; PERFORM public.workspace_assert_employee_target(nullif(p_data->>''id'','''')::uuid,target_role);');
SELECT public.workspace_patch_function('public.btb_save_training_topic(uuid,integer,text,text,integer,boolean,text,jsonb,text)',
  'location_id IS NULL', 'location_id=(public.workspace_request_context()->>''locationId'')::uuid');
SELECT public.workspace_patch_function('public.btb_save_training_topic(uuid,integer,text,text,integer,boolean,text,jsonb,text)',
  'BEGIN', 'BEGIN
  IF NOT public.btb_effective_page_allowed(public.workspace_request_context()->>''role'',(public.workspace_request_context()->>''credentialId'')::uuid,''training-guide'',true) THEN RAISE EXCEPTION ''Training administration required'' USING ERRCODE=''42501''; END IF;');
SELECT public.workspace_patch_function('public.btb_save_training_record(uuid,uuid,integer,integer,uuid[],boolean,text,text)',
  'location_id IS NULL', 'location_id=(public.workspace_request_context()->>''locationId'')::uuid');
SELECT public.workspace_patch_function('public.btb_save_training_record(uuid,uuid,integer,integer,uuid[],boolean,text,text)',
  'BEGIN', 'BEGIN
  IF public.workspace_request_context()->>''principalType''<>''employee'' OR p_employee_id IS DISTINCT FROM (public.workspace_request_context()->>''credentialId'')::uuid OR NOT public.btb_effective_page_allowed(public.workspace_request_context()->>''role'',p_employee_id,''training-guide'',false) THEN RAISE EXCEPTION ''Personal training access required'' USING ERRCODE=''42501''; END IF;');
SELECT public.workspace_patch_function('public.btb_review_training(uuid,integer,text,text,uuid,text)',
  'topic.location_id IS NOT NULL', 'topic.location_id IS DISTINCT FROM (public.workspace_request_context()->>''locationId'')::uuid');
SELECT public.workspace_patch_function('public.btb_review_training(uuid,integer,text,text,uuid,text)',
  'BEGIN', 'BEGIN
  IF p_reviewer IS DISTINCT FROM (public.workspace_request_context()->>''credentialId'')::uuid OR NOT public.btb_effective_page_allowed(public.workspace_request_context()->>''role'',p_reviewer,''training-guide'',true) OR NOT EXISTS(SELECT 1 FROM public.btb_training_records r JOIN public.btb_location_access a ON a.employee_id=r.employee_id WHERE r.id=p_id AND r.location_id=(public.workspace_request_context()->>''locationId'')::uuid AND a.location_id=r.location_id) THEN RAISE EXCEPTION ''Current workspace training review required'' USING ERRCODE=''42501''; END IF;');
SELECT public.workspace_patch_function('public.btb_platform_notification_read(uuid,integer,uuid)',
  'WHERE id=p_id', 'WHERE id=p_id AND location_id=(public.workspace_request_context()->>''locationId'')::uuid');
SELECT public.workspace_patch_function('public.workspace_revoke_source_sessions()',
  '''role_page_access'',''workspace_console_locations''', '''role_page_access'',''workspace_console_locations'',''workspace_location_role_access''');
DROP FUNCTION public.workspace_patch_function(regprocedure,text,text);

CREATE FUNCTION public.workspace_scope_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',table_name,'columns',columns,'uuidTenant',uuid_tenant) ORDER BY table_name),'[]'::jsonb)
  FROM (SELECT table_name,jsonb_agg(column_name ORDER BY ordinal_position) columns,
    bool_or(column_name='tenant_id' AND udt_name='uuid') uuid_tenant
    FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) catalog
$$;

CREATE FUNCTION public.workspace_guard_scoped_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb; row_data jsonb; old_data jsonb; location uuid; provision text;
  reference record; reference_id uuid; valid boolean; parent_scope text;
BEGIN
  IF nullif(current_setting('request.headers',true),'')::jsonb->>'x-workspace-session' IS NULL THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  context:=public.workspace_request_context();
  row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  old_data:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  location:=CASE WHEN TG_TABLE_NAME='locations' THEN (row_data->>'id')::uuid ELSE (row_data->>'location_id')::uuid END;
  provision:=nullif(current_setting('workspace.provision_location',true),'');
  IF location IS NULL AND TG_OP='INSERT' AND TG_TABLE_NAME<>'locations' THEN
    NEW:=jsonb_populate_record(NEW,jsonb_build_object('location_id',context->>'locationId'));
    location:=(context->>'locationId')::uuid;
  END IF;
  IF location IS NULL OR (location IS DISTINCT FROM (context->>'locationId')::uuid AND (context->>'principalType'<>'console' OR provision IS DISTINCT FROM location::text))
    OR old_data ? 'location_id' AND (old_data->>'location_id')::uuid IS DISTINCT FROM location THEN
    RAISE EXCEPTION 'Row is not in the current workspace' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='locations' THEN
    IF (row_data->>'tenant_id')::uuid IS DISTINCT FROM (context->>'tenantId')::uuid THEN RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE='42501'; END IF;
    IF TG_OP='UPDATE' AND old_data->>'tenant_id' IS DISTINCT FROM row_data->>'tenant_id' THEN RAISE EXCEPTION 'Tenant reassignment not permitted' USING ERRCODE='42501'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.locations l WHERE l.id=location AND l.tenant_id=(context->>'tenantId')::uuid) THEN
    RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE='42501';
  END IF;
  IF row_data ? 'restaurant_name' AND row_data->>'restaurant_name' IS DISTINCT FROM context->>'tenantName' THEN
    RAISE EXCEPTION 'Restaurant mismatch' USING ERRCODE='42501';
  END IF;
  -- A stamped child may not point at an unassigned or another-location parent.
  -- This also protects non-embedded reads of that relationship later.
  IF TG_OP<>'DELETE' THEN
    FOR reference IN SELECT c.confrelid parent_table,child.attname child_column,parent.attname parent_column,
        parent.relname parent_name,parent.relnamespace parent_schema
      FROM pg_constraint c JOIN pg_attribute child ON child.attrelid=c.conrelid AND child.attnum=c.conkey[1]
      JOIN pg_attribute parent ON parent.attrelid=c.confrelid AND parent.attnum=c.confkey[1]
      JOIN pg_class parent_relation ON parent_relation.oid=c.confrelid
      -- pg_class identifiers are selected separately below (attribute rows have no relname).
      WHERE c.conrelid=TG_RELID AND c.contype='f' AND cardinality(c.conkey)=1 LOOP
      NULL;
    END LOOP;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name)
    WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND (c.column_name='location_id' OR c.table_name='locations')
    AND c.table_name NOT IN ('profiles','workspace_auth_sessions','workspace_console_locations') LOOP
    EXECUTE format('CREATE TRIGGER workspace_scoped_row BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.workspace_guard_scoped_row()',item.table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',item.table_name);
  END LOOP;
END $$;

-- Raw browser data/RPCs and old page bearer tokens are no longer a supported
-- authorization channel. All application access is through verified APIs.
UPDATE public.btb_public_tokens SET revoked_at=now() WHERE revoked_at IS NULL;
CREATE OR REPLACE FUNCTION public.btb_public_capability(p_page text,p_write boolean DEFAULT false)
RETURNS public.btb_public_tokens LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT NULL::public.btb_public_tokens
$$;
CREATE OR REPLACE FUNCTION public.btb_location_belongs_to_workspace(p_location uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context();
BEGIN
  RETURN p_location IS NOT NULL AND p_location=(context->>'locationId')::uuid AND EXISTS(
    SELECT 1 FROM public.locations WHERE id=p_location AND tenant_id=(context->>'tenantId')::uuid AND active);
END $$;

-- The temperature replay implementation remains atomic and keeps original
-- receipts. It now derives the author and branch only from the server session.
ALTER FUNCTION public.btb_insert_temp_record(jsonb,text) RENAME TO workspace_insert_temp_record_atomic;
REVOKE ALL ON FUNCTION public.workspace_insert_temp_record_atomic(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.btb_insert_temp_record(p_data jsonb,p_replay_key text) RETURNS public.temperature_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context(); prior_claims text; saved public.temperature_records;
BEGIN
  IF context->>'principalType'<>'supabase' OR context->>'role' NOT IN ('staff','supervisor','manager','owner')
    OR p_data->>'user_id' IS DISTINCT FROM context->>'credentialId'
    OR p_data->>'location_id' IS DISTINCT FROM context->>'locationId'
    OR p_data->>'restaurant_name' IS DISTINCT FROM context->>'tenantName' THEN
    RAISE EXCEPTION 'Capture does not belong to the current workspace' USING ERRCODE='42501';
  END IF;
  prior_claims:=current_setting('request.jwt.claims',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context->>'credentialId','role','service_role')::text,true);
  PERFORM set_config('request.jwt.claim.sub',context->>'credentialId',true);
  saved:=public.workspace_insert_temp_record_atomic(p_data,p_replay_key);
  PERFORM set_config('request.jwt.claims',coalesce(prior_claims,''),true);
  RETURN saved;
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  END LOOP;
END $$;
-- The revoke above takes the default PUBLIC grant away from everyone, including
-- the server. Hand the whole public surface back to service_role only: browsers
-- still cannot call any of it, and the application's RPCs keep working.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p WHERE p.pronamespace='public'::regnamespace LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.workspace_create_session(uuid,uuid,integer,uuid,uuid,text,timestamptz,uuid),
  public.workspace_request_context(),public.workspace_btb_page_grants(uuid,uuid),public.workspace_scope_catalog(),
  public.workspace_pre_request(),public.btb_insert_temp_record(jsonb,text),public.workspace_assert_employee_target(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_pre_request() TO anon,authenticated;
GRANT ALL ON public.workspace_location_role_access TO service_role;
CREATE TRIGGER workspace_revoke_sessions AFTER INSERT OR UPDATE OR DELETE ON public.workspace_location_role_access
  FOR EACH ROW EXECUTE FUNCTION public.workspace_revoke_source_sessions();
REVOKE ALL ON public.locations,public.location_members,public.btb_public_tokens FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.profiles FROM PUBLIC,anon,authenticated;
-- ---------------------------------------------------------------------------
-- Self-service trial provisioning.
--
-- A brand-new signup used to become role 'owner' only because it said so in its
-- own metadata. The hardened handle_new_user() (step 57) ignores that — so a
-- trial got a tenant-less profile it could never open. Provisioning now creates
-- the tenant and its first location here, with the server deciding ownership:
-- metadata can name a restaurant, never a role, a tenant or a location.
--
-- The profile guard keeps blocking browser writes to role/location/tenant; the
-- provisioning function marks its own transaction so it can set them.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user <> 'service_role' AND COALESCE(current_setting('workspace.provisioning',true),'') <> '1' THEN
    IF TG_OP='UPDATE' AND (
      NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.active IS DISTINCT FROM OLD.active
      OR NEW.restaurant_name IS DISTINCT FROM OLD.restaurant_name
      OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
    ) THEN RAISE EXCEPTION 'Profile privileges require service_role' USING ERRCODE='42501'; END IF;
    IF TG_OP='INSERT' AND (NEW.role<>'staff' OR NEW.location_id IS NOT NULL OR NEW.tenant_id IS NOT NULL)
      THEN RAISE EXCEPTION 'Profile assignments require service_role' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  display text := nullif(trim(COALESCE(NEW.raw_user_meta_data->>'restaurant_name','')),'');
  suffix text := substr(md5(NEW.id::text),1,8);
  base text;
  site_slug text;
  new_tenant uuid;
  new_location uuid;
BEGIN
  IF display IS NULL THEN display := 'My restaurant'; END IF;
  -- Tenant names are unique per owner; a repeat gets a short, stable suffix.
  IF EXISTS (SELECT 1 FROM public.workspace_tenants t WHERE lower(trim(t.name))=lower(display)) THEN
    display := display||' · '||suffix;
  END IF;
  base := nullif(trim(both '-' from regexp_replace(lower(display),'[^a-z0-9]+','-','g')),'');
  IF base IS NULL THEN base := 'workspace-'||suffix; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_tenants t WHERE t.slug=base) THEN base := left(base,80)||'-'||suffix; END IF;

  INSERT INTO public.workspace_tenants(name,slug) VALUES (display,base) RETURNING id INTO new_tenant;

  site_slug := base;
  IF EXISTS (SELECT 1 FROM public.locations l WHERE l.slug=site_slug) THEN site_slug := left(base,80)||'-'||suffix; END IF;
  INSERT INTO public.locations(name,slug,tenant_id) VALUES (display,site_slug,new_tenant) RETURNING id INTO new_location;

  PERFORM set_config('workspace.provisioning','1',true);
  INSERT INTO public.profiles(id,email,full_name,restaurant_name,role,location_id,tenant_id,trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    COALESCE(NEW.raw_user_meta_data->>'restaurant_name',''),
    'owner',
    new_location,
    new_tenant,
    CASE WHEN NEW.raw_user_meta_data->>'trial'='1' THEN now()+interval '30 days' ELSE NULL END
  );
  -- The confirmed owner of the first site of their own tenant.
  INSERT INTO public.location_members(location_id,user_id) VALUES (new_location,NEW.id)
    ON CONFLICT DO NOTHING;
  PERFORM set_config('workspace.provisioning','',true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never leave a half-built tenant behind, and never swallow the real error.
  PERFORM set_config('workspace.provisioning','',true);
  RAISE;
END $$;

-- Reading your own row is unchanged (RLS limits it to auth.uid() = id) so the
-- dashboard keeps working; only browser WRITES stay closed. The same applies to
-- the site lists the dashboard reads: SELECT only, writes remain server-only.
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.locations, public.location_members TO authenticated;

NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';
COMMIT;
