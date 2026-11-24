-- Release 12, step 65: inviting a person is idempotent by normalised email.
--
-- The invite used to fail with "signal timed out" in the browser while the
-- invitation had in fact been committed, so the natural next action was to click
-- again. The second attempt re-used the employee by email (good) but rejected the
-- person outright if the typed name differed by even a space or capitalisation
-- from the row created a moment earlier (40001). Retrying after a timeout must
-- always be safe.
--
-- Step 65 keeps the tenant and role guards (a role mismatch still refuses, so an
-- invitation can never silently change someone's authority) and drops only the
-- name comparison: the existing employee record is authoritative, and their own
-- name is what the email and every location already show.
BEGIN;

CREATE OR REPLACE FUNCTION public.btb_admin_add_person(p_actor uuid,p_session integer,p_location uuid,p_data jsonb,p_token_hash text,p_subject text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE person btb_employees; v_email text:=lower(trim(p_data->>'email')); v_name text:=trim(p_data->>'name'); v_role text:=p_data->>'role';
BEGIN
  PERFORM btb_admin_assert_location(p_actor,p_session,p_location);
  IF coalesce(v_email,'')='' OR v_email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' OR length(v_email)>254
    OR v_email LIKE '%@btb.demo' OR coalesce(v_name,'')='' OR length(v_name)>100
    OR v_role IS NULL OR v_role NOT IN ('staff','supervisor','manager') THEN
    RAISE EXCEPTION 'Valid person name, email and role required' USING ERRCODE='22023';
  END IF;
  -- Serialises concurrent retries of the same click, so one person and one live
  -- invitation result from however many attempts arrive.
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-invite-email:'||v_email,0));
  SELECT * INTO person FROM btb_employees WHERE lower(email)=v_email FOR UPDATE;
  IF person.id IS NULL THEN
    -- DO NOT call btb_save_employee: no credential exists until acceptance.
    INSERT INTO btb_employees(name,email,role,active,login_enabled) VALUES(v_name,v_email,v_role,true,false) RETURNING * INTO person;
  ELSIF person.restaurant_name<>'Between the Buns' OR person.role<>v_role THEN
    -- Role is authority, so it is never adopted silently.
    RAISE EXCEPTION 'This email belongs to an existing person; use their existing name and role at all locations' USING ERRCODE='40001';
  ELSE
    -- Idempotent retry: the existing record keeps its own name.
    v_name:=person.name;
  END IF;
  INSERT INTO btb_location_access(location_id,employee_id) VALUES(p_location,person.id) ON CONFLICT DO NOTHING;
  RETURN btb_admin_issue_invite(p_actor,p_session,p_location,person.id,p_token_hash,p_subject,p_body);
END $$;

DO $$ DECLARE definition text; BEGIN
  definition:=pg_get_functiondef('public.btb_admin_add_person(uuid,integer,uuid,jsonb,text,text,text)'::regprocedure);
  IF definition LIKE '%person.name<>v_name%' THEN RAISE EXCEPTION 'The name comparison still blocks a retry'; END IF;
  IF definition NOT LIKE '%person.role<>v_role%' THEN RAISE EXCEPTION 'The role guard was lost'; END IF;
  IF definition NOT LIKE '%btb_location_access(location_id,employee_id) VALUES(p_location,person.id) ON CONFLICT DO NOTHING%' THEN
    RAISE EXCEPTION 'Membership idempotency was lost';
  END IF;
  REVOKE EXECUTE ON FUNCTION public.btb_admin_add_person(uuid,integer,uuid,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
  GRANT EXECUTE ON FUNCTION public.btb_admin_add_person(uuid,integer,uuid,jsonb,text,text,text) TO service_role;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
