-- Step 46: a branch manager may configure their own location's settings,
-- including the AI extraction key. Corporate/owner retain organization-wide
-- reach; the location-membership check below still applies to managers.
BEGIN;
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
    WHEN 'settings' THEN actor.role IN ('manager','corporate','owner')
    ELSE false END;
  IF NOT allowed THEN RAISE EXCEPTION 'Role not permitted' USING ERRCODE='42501'; END IF;
  IF p_location IS NULL OR NOT EXISTS(SELECT 1 FROM btb_location_settings WHERE location_id=p_location AND active) THEN
    RAISE EXCEPTION 'Choose an active BTB location' USING ERRCODE='42501'; END IF;
  IF actor.role NOT IN ('corporate','owner') AND NOT (actor.role='designer' AND p_capability LIKE 'marketing.%')
    AND NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_actor AND location_id=p_location) THEN
    RAISE EXCEPTION 'Location not permitted' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.btb_platform_assert(uuid,integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_platform_assert(uuid,integer,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
