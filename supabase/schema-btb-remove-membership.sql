-- Release 12, step 63: removing a person from a branch.
--
-- Two separate pins blocked "Remove from location", and the second one made the
-- last-membership case impossible everywhere:
--
-- 1. workspace_guard_scoped_row() only accepted a row whose location equalled
--    the session's pinned branch (plus a provisioning exemption). A console
--    pinned to Calgary removing someone on Drumheller got 42501 "Row is not in
--    the current workspace". The console's boundary is its estate, exactly as in
--    steps 59-61.
-- 2. workspace_assert_employee_target() required a membership AT the pinned
--    branch. btb_admin_remove_person deletes that membership first and then
--    updates the employee when it was their last one — so the employee guard
--    fired on an employee who now has no memberships at all and raised 42501
--    "Person not in the current workspace". Removing the last membership could
--    therefore never succeed.
--
-- Step 63 keeps every tenant/location/role check and widens only those two
-- comparisons: a console may touch rows of any branch it administers, and an
-- employee who has no memberships left is still a legitimate target (that is the
-- state the removal itself just created).
BEGIN;

-- 2. A person with no remaining memberships is still ours to deactivate.
CREATE OR REPLACE FUNCTION public.workspace_assert_employee_target(p_employee uuid, p_role text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE context jsonb:=public.workspace_request_context(); target public.btb_employees;
BEGIN
  IF context->>'tenantSlug'<>'between-the-buns' OR context->>'principalType' NOT IN ('employee','console') THEN
    RAISE EXCEPTION 'Team administration required' USING ERRCODE='42501';
  END IF;
  IF p_employee IS NOT NULL THEN
    SELECT e.* INTO target FROM public.btb_employees e
      WHERE e.id=p_employee AND e.tenant_id=(context->>'tenantId')::uuid
        AND (EXISTS(SELECT 1 FROM public.btb_location_access a
              WHERE a.employee_id=e.id AND a.location_id=(context->>'locationId')::uuid)
          OR NOT EXISTS(SELECT 1 FROM public.btb_location_access a2 WHERE a2.employee_id=e.id));
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

-- 1. A console may stamp or remove rows of any branch it administers.
DO $$ DECLARE definition text; prior text;
BEGIN
  definition:=pg_get_functiondef('public.workspace_guard_scoped_row()'::regprocedure);
  prior:=definition;
  definition:=replace(definition,
    '(context->>''principalType''<>''console'' OR provision IS DISTINCT FROM location::text)',
    '(context->>''principalType''<>''console'' OR (provision IS DISTINCT FROM location::text AND NOT EXISTS(SELECT 1 FROM public.workspace_console_locations cm JOIN public.locations cl ON cl.id=cm.location_id WHERE cm.console_id=(context->>''credentialId'')::uuid AND cm.location_id=location AND cl.tenant_id=(context->>''tenantId'')::uuid)))');
  IF definition=prior THEN RAISE EXCEPTION 'Unexpected guard definition: console exemption not found'; END IF;
  IF definition NOT LIKE '%workspace_console_locations cm%' THEN RAISE EXCEPTION 'The console estate exemption is missing'; END IF;
  IF definition NOT LIKE '%Row is not in the current workspace%' THEN RAISE EXCEPTION 'The workspace guard lost its check'; END IF;
  EXECUTE definition;
END $$;

REVOKE EXECUTE ON FUNCTION public.workspace_assert_employee_target(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_assert_employee_target(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
