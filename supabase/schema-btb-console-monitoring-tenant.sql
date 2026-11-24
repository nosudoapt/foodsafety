-- Release 12, step 60: the console's monitoring figures cover the whole tenant.
--
-- Step 58 rewired btb_admin_monitoring() onto workspace_console_locations but
-- kept the single-branch pin in four places — the site list, the people count,
-- the activity heatmap and the recent activity feed — so every aggregate said
-- "locations: 1" no matter how many branches the console runs.
--
-- The console's boundary is the tenant, exactly as in btb_admin_locations()
-- (step 59). Monitoring is about live health, so it counts ACTIVE locations
-- (locations.active and btb_location_settings.active); the management list in
-- step 59 still shows closed branches so they can be reopened.
BEGIN;

-- One definition of "the branches this console monitors", used by every
-- aggregate so they can never drift apart again. It also re-checks that the
-- verified request really is that console, so a stray call fails closed.
CREATE OR REPLACE FUNCTION public.btb_console_site_ids(p_actor uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.location_id
  FROM public.workspace_console_locations m
  JOIN public.locations l ON l.id=m.location_id AND l.active
    AND l.tenant_id=(public.workspace_request_context()->>'tenantId')::uuid
  JOIN public.btb_location_settings s ON s.location_id=l.id AND coalesce(s.active,true)
  WHERE m.console_id=p_actor
    AND (public.workspace_request_context()->>'principalType')='console'
    AND (public.workspace_request_context()->>'credentialId')::uuid=p_actor
$$;

DO $$ DECLARE signature regprocedure := 'public.btb_admin_monitoring(uuid,integer,integer)'::regprocedure;
  definition text; prior text;
BEGIN
  definition:=pg_get_functiondef(signature); prior:=definition;

  -- The site list: tenant-wide and active, no single-branch pin.
  definition:=replace(definition,
    'JOIN locations l ON l.id=m.location_id AND m.console_id=p_actor AND l.id=(public.workspace_request_context()->>''locationId'')::uuid AND l.tenant_id=(public.workspace_request_context()->>''tenantId'')::uuid',
    'JOIN locations l ON l.id=m.location_id AND m.console_id=p_actor AND l.active AND l.tenant_id=(public.workspace_request_context()->>''tenantId'')::uuid');

  -- The three sub-selects that enumerate branches.
  definition:=replace(definition,
    'IN (SELECT location_id FROM workspace_console_locations WHERE console_id=p_actor AND location_id=(public.workspace_request_context()->>''locationId'')::uuid)',
    'IN (SELECT public.btb_console_site_ids(p_actor))');

  IF definition=prior THEN RAISE EXCEPTION 'Unexpected monitoring definition: no console pin found'; END IF;
  IF definition LIKE '%(public.workspace_request_context()->>''locationId'')::uuid%' THEN
    RAISE EXCEPTION 'Monitoring still pins to a single branch';
  END IF;
  EXECUTE definition;
END $$;

REVOKE EXECUTE ON FUNCTION public.btb_console_site_ids(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_console_site_ids(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.btb_admin_monitoring(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_admin_monitoring(uuid,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
