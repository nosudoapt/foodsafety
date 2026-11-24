-- Release 12, step 61: a console may act on any branch of its estate.
--
-- btb_admin_assert_location() gated every console write (people, invitations,
-- passwords, location settings) on `p_location = the session's pinned location`.
-- With six branches and one pinned session that is a lockout: only the branch a
-- console happened to sign in on could be managed, and every other branch
-- answered 42501 "Current console location required".
--
-- The console's boundary is the tenant. Keep every existing check — a real
-- console session, an explicit assignment, same tenant, active branch — and drop
-- only the equality with the pinned id.
BEGIN;

CREATE OR REPLACE FUNCTION public.btb_admin_assert_location(p_actor uuid,p_session integer,p_location uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context();
BEGIN
  PERFORM public.btb_admin_session(p_actor,p_session);
  IF p_location IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.workspace_console_locations a JOIN public.locations l ON l.id=a.location_id
    WHERE a.console_id=p_actor AND l.id=p_location AND l.tenant_id=(context->>'tenantId')::uuid AND l.active) THEN
    RAISE EXCEPTION 'This location is not in your console' USING ERRCODE='42501';
  END IF;
END $$;

DO $$ BEGIN
  IF pg_get_functiondef('public.btb_admin_assert_location(uuid,integer,uuid)'::regprocedure)
       LIKE '%IS DISTINCT FROM (context->>''locationId'')::uuid%' THEN
    RAISE EXCEPTION 'The console location check still pins to one branch';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.btb_admin_assert_location(uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_admin_assert_location(uuid,integer,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
