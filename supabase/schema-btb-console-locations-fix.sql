-- Release 12, step 59: repair the console's location list.
--
-- Step 58 rewrote btb_admin_locations() to read workspace_console_locations
-- instead of the global managed register, but kept the old `m.created_at`
-- (that table has no created_at, only its two keys), and pinned the row set to
-- the single current branch. The console could therefore neither load its
-- locations ("column m.created_at does not exist") nor manage more than one.
--
-- The console's real boundary is the tenant: this console, in this tenant. It is
-- still gated by btb_admin_session() (console principal, admin role, BTB tenant,
-- matching credential version).
BEGIN;

CREATE OR REPLACE FUNCTION public.btb_admin_locations(p_actor uuid, p_session integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE data jsonb; context jsonb := public.workspace_request_context();
BEGIN
  PERFORM public.btb_admin_session(p_actor, p_session);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'slug',l.slug,'address',l.address,'active',s.active,'timezone',s.timezone,
    'version',s.version,'storage_limit_bytes',s.storage_limit_bytes,'created_at',l.created_at,
    'people',(SELECT count(*) FROM public.btb_location_access a WHERE a.location_id=l.id),
    'pages',coalesce((SELECT jsonb_agg(page ORDER BY page) FROM public.btb_location_page_access a WHERE a.location_id=l.id AND a.allowed),'[]'::jsonb)
  ) ORDER BY l.name,l.id),'[]'::jsonb) INTO data
  FROM public.workspace_console_locations m
    JOIN public.locations l ON l.id=m.location_id AND m.console_id=p_actor
      AND l.tenant_id=(context->>'tenantId')::uuid
    JOIN public.btb_location_settings s ON s.location_id=l.id;
  RETURN jsonb_build_object('locations',data);
END $function$;

REVOKE EXECUTE ON FUNCTION public.btb_admin_locations(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_admin_locations(uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
