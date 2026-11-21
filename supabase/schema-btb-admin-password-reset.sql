-- Step 42: a console super-admin can set a new password for a locked-out person
-- without email. The password is hashed before it leaves the API; sessions for
-- the old credential are revoked by bumping session_version.
BEGIN;
CREATE OR REPLACE FUNCTION public.btb_admin_reset_password(p_actor uuid,p_session integer,p_location uuid,p_employee uuid,p_password_hash text)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM btb_admin_assert_location(p_actor,p_session,p_location);
  PERFORM 1 FROM btb_employees WHERE id=p_employee FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM btb_location_access WHERE location_id=p_location AND employee_id=p_employee) THEN
    RAISE EXCEPTION 'Person not assigned to this location' USING ERRCODE='42501';
  END IF;
  IF p_password_hash IS NULL OR p_password_hash !~ '^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$' THEN
    RAISE EXCEPTION 'Invalid password hash' USING ERRCODE='22023';
  END IF;
  UPDATE btb_employees SET active=true,login_enabled=true,version=version+1,updated_at=now() WHERE id=p_employee;
  UPDATE btb_employee_credentials SET password_hash=p_password_hash,session_version=session_version+1,updated_at=now()
    WHERE employee_id=p_employee;
  IF NOT FOUND THEN
    INSERT INTO btb_employee_credentials(employee_id,password_hash,session_version) VALUES(p_employee,p_password_hash,1);
  END IF;
  PERFORM btb_admin_invalidate_invites(p_employee);
  PERFORM btb_admin_event(p_actor,p_session,p_location,'console_person',p_employee,'reset_password',NULL,NULL);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.btb_admin_reset_password(uuid,integer,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_admin_reset_password(uuid,integer,uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
