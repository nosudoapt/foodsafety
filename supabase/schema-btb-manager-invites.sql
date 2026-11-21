-- Step 40: managers and supervisors can invite their own team from the
-- workspace. Invitations keep their existing single-use token, seven-day
-- expiry and outbox row; only the inviter changes (employee instead of
-- console super-admin).
BEGIN;
ALTER TABLE public.btb_invitations ALTER COLUMN invited_by DROP NOT NULL;
ALTER TABLE public.btb_invitations ADD COLUMN IF NOT EXISTS invited_by_employee uuid REFERENCES public.btb_employees(id);
ALTER TABLE public.btb_invitations DROP CONSTRAINT IF EXISTS btb_invitations_inviter_check;
ALTER TABLE public.btb_invitations ADD CONSTRAINT btb_invitations_inviter_check CHECK (num_nonnulls(invited_by,invited_by_employee)=1);

-- Mirrors employeeEditableBy() in src/lib/btb-team.ts.
CREATE OR REPLACE FUNCTION public.btb_employee_manageable(p_actor_role text,p_target_role text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT (p_actor_role='manager' AND p_target_role IN ('staff','supervisor','manager'))
      OR (p_actor_role='supervisor' AND p_target_role='staff');
$$;

CREATE OR REPLACE FUNCTION public.btb_employee_issue_invite(p_actor uuid,p_session integer,p_location uuid,p_employee uuid,p_token_hash text,p_subject text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor btb_employees; person btb_employees; invite btb_invitations; job uuid;
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  IF actor.role NOT IN ('manager','supervisor') THEN
    RAISE EXCEPTION 'Only a manager or supervisor can invite this team' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_actor AND location_id=p_location)
    OR NOT EXISTS(SELECT 1 FROM btb_location_settings WHERE location_id=p_location AND active) THEN
    RAISE EXCEPTION 'You are not assigned to an active location' USING ERRCODE='42501';
  END IF;
  SELECT * INTO person FROM btb_employees WHERE id=p_employee FOR UPDATE;
  IF person.id IS NULL OR person.restaurant_name<>'Between the Buns' OR person.role NOT IN ('staff','supervisor','manager') OR person.email IS NULL
    OR NOT btb_employee_manageable(actor.role,person.role)
    OR NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_employee AND location_id=p_location) THEN
    RAISE EXCEPTION 'This person cannot be invited from your account' USING ERRCODE='42501';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR coalesce(p_body,'')='' OR length(p_body)>8000
    OR coalesce(trim(p_subject),'')='' OR length(p_subject)>200 THEN
    RAISE EXCEPTION 'Invalid invitation payload' USING ERRCODE='22023';
  END IF;
  PERFORM btb_admin_invalidate_invites(p_employee);
  -- Re-inviting an inactive person unblocks them but never fabricates a
  -- password: they cannot sign in until this invitation is accepted.
  IF NOT person.active THEN
    UPDATE btb_employees SET active=true,login_enabled=false,version=version+1,updated_at=now() WHERE id=p_employee;
  END IF;
  INSERT INTO btb_invitations(employee_id,email,role,location_id,token_hash,expires_at,invited_by,invited_by_employee)
    VALUES(p_employee,person.email,person.role,p_location,p_token_hash,now()+interval '7 days',NULL,p_actor) RETURNING * INTO invite;
  INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,recipient,subject,body,payload)
    VALUES('invite:'||invite.id,p_location,'invite',person.email,p_subject,p_body,
      jsonb_build_object('invitation_id',invite.id,'employee_id',p_employee)) RETURNING id INTO job;
  RETURN jsonb_build_object('employee_id',p_employee,'invitation_id',invite.id,'expires_at',invite.expires_at,'email_status','pending','job_id',job);
END $$;

CREATE OR REPLACE FUNCTION public.btb_employee_add_person(p_actor uuid,p_session integer,p_location uuid,p_data jsonb,p_token_hash text,p_subject text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor btb_employees; person btb_employees;
  v_email text:=lower(trim(p_data->>'email')); v_name text:=trim(p_data->>'name'); v_role text:=p_data->>'role';
BEGIN
  actor:=btb_platform_actor(p_actor,p_session);
  IF actor.role NOT IN ('manager','supervisor') THEN
    RAISE EXCEPTION 'Only a manager or supervisor can invite this team' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_actor AND location_id=p_location)
    OR NOT EXISTS(SELECT 1 FROM btb_location_settings WHERE location_id=p_location AND active) THEN
    RAISE EXCEPTION 'You are not assigned to an active location' USING ERRCODE='42501';
  END IF;
  IF coalesce(v_email,'')='' OR v_email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' OR length(v_email)>254
    OR v_email LIKE '%@btb.demo' OR coalesce(v_name,'')='' OR length(v_name)>100
    OR v_role IS NULL OR v_role NOT IN ('staff','supervisor','manager')
    OR NOT btb_employee_manageable(actor.role,v_role) THEN
    RAISE EXCEPTION 'Valid person name, email and role required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-invite-email:'||v_email,0));
  SELECT * INTO person FROM btb_employees WHERE lower(email)=v_email AND restaurant_name='Between the Buns' FOR UPDATE;
  IF person.id IS NULL THEN
    -- No credential exists until the invitation is accepted.
    INSERT INTO btb_employees(name,email,role,active,login_enabled) VALUES(v_name,v_email,v_role,true,false) RETURNING * INTO person;
  ELSIF person.name<>v_name OR person.role<>v_role THEN
    RAISE EXCEPTION 'This email belongs to an existing person; use their existing name and role' USING ERRCODE='40001';
  END IF;
  IF NOT btb_employee_manageable(actor.role,person.role) THEN
    RAISE EXCEPTION 'This person cannot be invited from your account' USING ERRCODE='42501';
  END IF;
  INSERT INTO btb_location_access(location_id,employee_id) VALUES(p_location,person.id) ON CONFLICT DO NOTHING;
  RETURN btb_employee_issue_invite(p_actor,p_session,p_location,person.id,p_token_hash,p_subject,p_body);
END $$;

REVOKE ALL ON FUNCTION public.btb_employee_manageable(text,text),public.btb_employee_issue_invite(uuid,integer,uuid,uuid,text,text,text),public.btb_employee_add_person(uuid,integer,uuid,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_employee_manageable(text,text),public.btb_employee_issue_invite(uuid,integer,uuid,uuid,text,text,text),public.btb_employee_add_person(uuid,integer,uuid,jsonb,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
