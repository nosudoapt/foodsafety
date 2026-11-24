-- Release 12, step 64: disable a person's sessions, not just their cookie.
--
-- Removing someone's last membership (or blocking them) already flips
-- active/login_enabled and bumps the principal version, so their cookie stops
-- verifying on the next request. The durable workspace_auth_sessions row stayed
-- open until it expired, though — an audit would show a live session for a
-- disabled person. These two console actions now revoke those rows explicitly.
BEGIN;

CREATE OR REPLACE FUNCTION public.btb_admin_block_person(p_actor uuid,p_session integer,p_location uuid,p_employee uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM btb_admin_assert_location(p_actor,p_session,p_location);
  PERFORM 1 FROM btb_employees WHERE id=p_employee FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM btb_location_access WHERE location_id=p_location AND employee_id=p_employee) THEN
    RAISE EXCEPTION 'Person not assigned to this location' USING ERRCODE='42501';
  END IF;
  UPDATE btb_employees SET active=false,login_enabled=false,version=version+1,updated_at=now() WHERE id=p_employee;
  UPDATE btb_employee_credentials SET session_version=session_version+1,updated_at=now() WHERE employee_id=p_employee;
  UPDATE public.workspace_auth_sessions s SET revoked_at=now()
    FROM public.workspace_principals p
    WHERE s.principal_id=p.id AND s.revoked_at IS NULL
      AND (p.credential_id=p_employee
        OR EXISTS(SELECT 1 FROM public.workspace_credential_links l WHERE l.employee_id=p_employee AND l.principal_id=p.id));
  PERFORM btb_admin_invalidate_invites(p_employee);
  PERFORM btb_admin_event(p_actor,p_session,p_location,'console_person',p_employee,'block',NULL,jsonb_build_object('active',false));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_remove_person(p_actor uuid,p_session integer,p_location uuid,p_employee uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM btb_admin_assert_location(p_actor,p_session,p_location);
  PERFORM 1 FROM btb_employees WHERE id=p_employee FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM btb_location_access WHERE location_id=p_location AND employee_id=p_employee) THEN
    RAISE EXCEPTION 'Person not assigned to this location' USING ERRCODE='42501';
  END IF;
  DELETE FROM btb_location_access WHERE location_id=p_location AND employee_id=p_employee;
  -- Never delete the person or their historical operations / uploads.
  PERFORM btb_admin_invalidate_invites(p_employee);
  IF NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_employee) THEN
    UPDATE btb_employees SET active=false,login_enabled=false,version=version+1,updated_at=now() WHERE id=p_employee;
    UPDATE btb_employee_credentials SET session_version=session_version+1,updated_at=now() WHERE employee_id=p_employee;
    -- No branch left: nothing may keep a usable session.
    UPDATE public.workspace_auth_sessions s SET revoked_at=now()
      FROM public.workspace_principals p
      WHERE s.principal_id=p.id AND s.revoked_at IS NULL
        AND (p.credential_id=p_employee
          OR EXISTS(SELECT 1 FROM public.workspace_credential_links l WHERE l.employee_id=p_employee AND l.principal_id=p.id));
  END IF;
  PERFORM btb_admin_event(p_actor,p_session,p_location,'console_person',p_employee,'remove_membership',NULL,NULL);
  RETURN true;
END $$;

DO $$ DECLARE name text; definition text; BEGIN
  FOREACH name IN ARRAY ARRAY['btb_admin_block_person','btb_admin_remove_person'] LOOP
    definition:=pg_get_functiondef(('public.'||name||'(uuid,integer,uuid,uuid)')::regprocedure);
    IF definition NOT LIKE '%workspace_auth_sessions s SET revoked_at=now()%' THEN
      RAISE EXCEPTION '% does not revoke the person''s sessions', name;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(uuid,integer,uuid,uuid) FROM PUBLIC,anon,authenticated', name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(uuid,integer,uuid,uuid) TO service_role', name);
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
