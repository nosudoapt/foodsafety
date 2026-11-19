-- Step 33: transactional person invitations, existing employee credentials,
-- and unioned location page grants. Raw tokens exist only in outbound email.
BEGIN;
CREATE TABLE IF NOT EXISTS public.btb_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  email text NOT NULL CHECK (email=lower(trim(email))),
  role text NOT NULL CHECK (role IN ('staff','supervisor','manager')),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL, used_at timestamptz,
  invited_by uuid NOT NULL REFERENCES public.btb_super_admins(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_invitations_employee ON public.btb_invitations(employee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS btb_invitations_location ON public.btb_invitations(location_id,created_at DESC);

-- Serialize lifecycle changes per employee before touching invitation rows.
-- A re-invite invalidates every prior unused token for this PERSON, not merely
-- this location. An email already accepted by the provider cannot be recalled.
CREATE OR REPLACE FUNCTION public.btb_admin_invalidate_invites(p_employee uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE btb_invitations SET expires_at=least(expires_at,now()) WHERE employee_id=p_employee AND used_at IS NULL;
  UPDATE btb_email_jobs j SET status='cancelled',error='Invitation superseded',lease_token=NULL,lease_until=NULL
  WHERE j.kind='invite' AND j.payload->>'employee_id'=p_employee::text AND
    (j.status IN ('pending','failed') OR (j.status='sending' AND (j.lease_until IS NULL OR j.lease_until<=now())));
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_issue_invite(p_actor uuid,p_session integer,p_location uuid,p_employee uuid,p_token_hash text,p_subject text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE person btb_employees; invite btb_invitations; job uuid;
BEGIN
  PERFORM btb_admin_assert_location(p_actor,p_session,p_location);
  SELECT * INTO person FROM btb_employees WHERE id=p_employee FOR UPDATE;
  IF person.id IS NULL OR person.restaurant_name<>'Between the Buns' OR person.role NOT IN ('staff','supervisor','manager') OR person.email IS NULL OR
    NOT EXISTS(SELECT 1 FROM btb_location_access WHERE employee_id=p_employee AND location_id=p_location) THEN
    RAISE EXCEPTION 'Person not assigned to this location' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM btb_location_settings WHERE location_id=p_location AND active) THEN
    RAISE EXCEPTION 'Activate the location before inviting people' USING ERRCODE='22023';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR coalesce(p_body,'')='' OR length(p_body)>8000
    OR coalesce(trim(p_subject),'')='' OR length(p_subject)>200 THEN
    RAISE EXCEPTION 'Invalid invitation payload' USING ERRCODE='22023';
  END IF;
  PERFORM btb_admin_invalidate_invites(p_employee);
  -- Reinviting a blocked person explicitly unblocks them, but never fabricates
  -- a password. They cannot log in until this invitation has been consumed.
  IF NOT person.active THEN
    UPDATE btb_employees SET active=true,login_enabled=false,version=version+1,updated_at=now() WHERE id=p_employee;
  END IF;
  INSERT INTO btb_invitations(employee_id,email,role,location_id,token_hash,expires_at,invited_by)
    VALUES(p_employee,person.email,person.role,p_location,p_token_hash,now()+interval '7 days',p_actor) RETURNING * INTO invite;
  INSERT INTO btb_email_jobs(dedupe_key,location_id,kind,recipient,subject,body,payload)
    VALUES('invite:'||invite.id,p_location,'invite',person.email,p_subject,p_body,
      jsonb_build_object('invitation_id',invite.id,'employee_id',p_employee)) RETURNING id INTO job;
  PERFORM btb_admin_event(p_actor,p_session,p_location,'console_person',p_employee,'invite',NULL,
    jsonb_build_object('invitation_id',invite.id,'role',person.role));
  RETURN jsonb_build_object('employee_id',p_employee,'invitation_id',invite.id,'expires_at',invite.expires_at,'email_status','pending','job_id',job);
END $$;

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
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-invite-email:'||v_email,0));
  SELECT * INTO person FROM btb_employees WHERE lower(email)=v_email FOR UPDATE;
  IF person.id IS NULL THEN
    -- DO NOT call btb_save_employee: no credential exists until acceptance.
    INSERT INTO btb_employees(name,email,role,active,login_enabled) VALUES(v_name,v_email,v_role,true,false) RETURNING * INTO person;
  ELSIF person.restaurant_name<>'Between the Buns' OR person.role<>v_role OR person.name<>v_name THEN
    RAISE EXCEPTION 'This email belongs to an existing person; use their existing name and role at all locations' USING ERRCODE='40001';
  END IF;
  INSERT INTO btb_location_access(location_id,employee_id) VALUES(p_location,person.id) ON CONFLICT DO NOTHING;
  RETURN btb_admin_issue_invite(p_actor,p_session,p_location,person.id,p_token_hash,p_subject,p_body);
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_reinvite(p_actor uuid,p_session integer,p_location uuid,p_employee uuid,p_token_hash text,p_subject text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RETURN btb_admin_issue_invite(p_actor,p_session,p_location,p_employee,p_token_hash,p_subject,p_body);
END $$;

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
  END IF;
  PERFORM btb_admin_event(p_actor,p_session,p_location,'console_person',p_employee,'remove_membership',NULL,NULL);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.btb_admin_people(p_actor uuid,p_session integer,p_location uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM btb_admin_assert_location(p_actor,p_session,p_location);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'email',e.email,'role',e.role,
    'status',CASE WHEN NOT e.active THEN 'blocked' WHEN e.login_enabled THEN 'active' ELSE 'invited' END,
    'last_login_at',e.last_login_at,'location_ids',coalesce((SELECT jsonb_agg(location_id) FROM btb_location_access WHERE employee_id=e.id),'[]'::jsonb),
    'invitation',CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('expires_at',i.expires_at,'used_at',i.used_at,'created_at',i.created_at,
      'email_status',j.status,'email_error',j.error) END
  ) ORDER BY e.name,e.id),'[]'::jsonb) INTO data
  FROM btb_location_access a JOIN btb_employees e ON e.id=a.employee_id
  LEFT JOIN LATERAL (SELECT * FROM btb_invitations WHERE employee_id=e.id AND location_id=p_location ORDER BY created_at DESC,id DESC LIMIT 1) i ON true
  LEFT JOIN btb_email_jobs j ON j.dedupe_key='invite:'||i.id
  WHERE a.location_id=p_location;
  RETURN jsonb_build_object('people',data);
END $$;

-- Anonymous HTTP lookup is safe only with an unguessable token; this RPC is
-- still service-role-only. Do not leak the employee id or stored token hash.
CREATE OR REPLACE FUNCTION public.btb_invitation_lookup(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  SELECT jsonb_build_object('name',e.name,'email',i.email,'location',l.name,'expires_at',i.expires_at) INTO data
  FROM btb_invitations i JOIN btb_employees e ON e.id=i.employee_id JOIN locations l ON l.id=i.location_id
  JOIN btb_location_settings s ON s.location_id=i.location_id
  WHERE i.token_hash=p_token_hash AND i.used_at IS NULL AND i.expires_at>now() AND e.active AND s.active
    AND e.email=i.email AND e.role=i.role
    AND EXISTS(SELECT 1 FROM btb_location_access WHERE location_id=i.location_id AND employee_id=i.employee_id);
  RETURN data;
END $$;

CREATE OR REPLACE FUNCTION public.btb_invitation_consume(p_token_hash text,p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE invite btb_invitations; person btb_employees; session integer; person_id uuid;
BEGIN
  -- Lock order matches resend/block/remove. Re-read the token AFTER obtaining
  -- the employee lock, so concurrent accepts can never both consume it.
  SELECT employee_id INTO person_id FROM btb_invitations WHERE token_hash=p_token_hash;
  SELECT * INTO person FROM btb_employees WHERE id=person_id FOR UPDATE;
  SELECT * INTO invite FROM btb_invitations WHERE token_hash=p_token_hash FOR UPDATE;
  IF invite.id IS NULL OR invite.used_at IS NOT NULL OR invite.expires_at<=now() OR person.id IS NULL OR NOT person.active
    OR person.email IS DISTINCT FROM invite.email OR person.role IS DISTINCT FROM invite.role
    OR NOT EXISTS(SELECT 1 FROM btb_location_access a JOIN btb_location_settings s USING(location_id)
      WHERE a.location_id=invite.location_id AND a.employee_id=person.id AND s.active) THEN
    RAISE EXCEPTION 'Invitation invalid, expired or already used' USING ERRCODE='22023';
  END IF;
  IF p_password_hash IS NULL OR p_password_hash !~ '^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$' THEN
    RAISE EXCEPTION 'A valid password hash is required' USING ERRCODE='22023';
  END IF;
  UPDATE btb_invitations SET used_at=now() WHERE id=invite.id;
  INSERT INTO btb_employee_credentials AS credentials(employee_id,password_hash,session_version)
    VALUES(person.id,p_password_hash,1) ON CONFLICT(employee_id) DO UPDATE
    SET password_hash=excluded.password_hash,session_version=credentials.session_version+1,updated_at=now()
    RETURNING session_version INTO session;
  UPDATE btb_employees SET login_enabled=true,version=version+1,updated_at=now(),last_login_at=now() WHERE id=person.id;
  PERFORM btb_admin_invalidate_invites(person.id);
  RETURN jsonb_build_object('id',person.id,'role',person.role,'name',person.name,'session_version',session);
END $$;

-- A single employee lookup for request-time grants. Many-to-many membership is
-- intentional: a page is granted by ANY active assigned location. No grants
-- means deny all, not the legacy static default. Unassigned legacy people keep
-- their legacy workspace; a removed console person never falls back to it.
CREATE OR REPLACE FUNCTION public.btb_employee_page_grants(p_employee uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE sites jsonb; pages jsonb; scoped boolean;
BEGIN
  SELECT coalesce(jsonb_agg(location_id ORDER BY location_id),'[]'::jsonb) INTO sites FROM btb_location_access WHERE employee_id=p_employee;
  scoped:=jsonb_array_length(sites)>0 OR EXISTS(SELECT 1 FROM btb_invitations WHERE employee_id=p_employee);
  SELECT coalesce(jsonb_agg(page ORDER BY page),'[]'::jsonb) INTO pages FROM (
    SELECT DISTINCT g.page FROM btb_location_access a JOIN btb_location_settings s USING(location_id)
    JOIN btb_location_page_access g USING(location_id) WHERE a.employee_id=p_employee AND s.active AND g.allowed
  ) granted;
  RETURN jsonb_build_object('locationIds',sites,'pageGrants',CASE WHEN scoped THEN pages ELSE NULL END);
END $$;

-- Preserve the existing worker's lease, closed-location, expiry and frozen-byte
-- checks. Add a last-moment invitation check before any provider request.
CREATE OR REPLACE FUNCTION public.btb_prepare_email_job(p_id uuid,p_lease uuid,p_from text,p_attachment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE job btb_email_jobs; person_id uuid;
BEGIN
  -- Invitation lifecycle functions lock the employee before email rows. Match
  -- that order, so a resend/block waits for this preflight rather than deadlocks.
  SELECT i.employee_id INTO person_id FROM btb_email_jobs j JOIN btb_invitations i ON i.id::text=j.payload->>'invitation_id'
    WHERE j.id=p_id AND j.kind='invite';
  IF person_id IS NOT NULL THEN PERFORM 1 FROM btb_employees WHERE id=person_id FOR SHARE; END IF;
  SELECT * INTO job FROM btb_email_jobs WHERE id=p_id AND lease_token=p_lease AND status='sending' AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF job.location_id IS NOT NULL THEN
    PERFORM 1 FROM btb_location_settings WHERE location_id=job.location_id AND active FOR SHARE;
    IF NOT FOUND THEN
      UPDATE btb_email_jobs SET status='cancelled',error='Location closed before delivery',lease_until=NULL,lease_token=NULL WHERE id=p_id;
      RETURN NULL;
    END IF;
  END IF;
  IF job.kind='invite' AND NOT EXISTS(SELECT 1 FROM btb_invitations i JOIN btb_employees e ON e.id=i.employee_id
    WHERE i.id::text=job.payload->>'invitation_id' AND i.used_at IS NULL AND i.expires_at>now() AND e.active
      AND i.email=e.email AND i.role=e.role AND EXISTS(SELECT 1 FROM btb_location_access a WHERE a.location_id=i.location_id AND a.employee_id=e.id)) THEN
    UPDATE btb_email_jobs SET status='cancelled',error='Invitation expired, used or superseded',lease_until=NULL,lease_token=NULL WHERE id=p_id;
    RETURN NULL;
  END IF;
  IF job.kind='expiry' AND NOT EXISTS(SELECT 1 FROM compliance_documents d WHERE d.id=(job.payload->>'document_id')::uuid AND d.version=(job.payload->>'version')::integer AND d.expiry_date=(job.payload->>'expiry')::date) THEN
    UPDATE btb_email_jobs SET status='cancelled',error='Superseded document revision',lease_until=NULL,lease_token=NULL WHERE id=p_id;
    RETURN NULL;
  END IF;
  IF job.kind='daily' AND coalesce(job.attachment_base64,p_attachment) IS NULL THEN RAISE EXCEPTION 'Daily PDF attachment required'; END IF;
  UPDATE btb_email_jobs SET frozen_from=coalesce(frozen_from,p_from),attachment_base64=coalesce(attachment_base64,p_attachment),
    attachment_name=CASE WHEN job.kind='daily' THEN coalesce(attachment_name,'BTB-Operations-'||business_date||'.pdf') ELSE attachment_name END
    WHERE id=p_id RETURNING * INTO job;
  RETURN to_jsonb(job);
END $$;

ALTER TABLE public.btb_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_invitations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.btb_invitations TO service_role;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE 'btb_admin_%' OR proname LIKE 'btb_invitation_%' OR proname IN ('btb_employee_page_grants','btb_prepare_email_job')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
