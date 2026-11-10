-- BTB individual accounts, attributed operations, training approvals and reminders.
-- Apply once through the SQL editor after the existing BTB schemas. Re-runnable.
-- Existing source records are copied, never deleted. No migration ledger is used.
BEGIN;

CREATE TABLE IF NOT EXISTS public.btb_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL DEFAULT 'Between the Buns' CHECK (restaurant_name = 'Between the Buns'),
  name text NOT NULL, email text CHECK (email IS NULL OR email=lower(trim(email))), phone text, position text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','supervisor','manager')),
  active boolean NOT NULL DEFAULT true, login_enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS btb_employee_email ON public.btb_employees(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.btb_employee_credentials (
  employee_id uuid PRIMARY KEY REFERENCES public.btb_employees(id),
  password_hash text NOT NULL,
  session_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.btb_login_limits (
  key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.btb_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL DEFAULT 'Between the Buns' CHECK (restaurant_name = 'Between the Buns'),
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  shift_date date NOT NULL, start_time text NOT NULL, end_time text NOT NULL,
  ends_next_day boolean NOT NULL DEFAULT false,
  duty text NOT NULL DEFAULT 'service' CHECK (duty IN ('opening','service','closing','both')),
  version integer NOT NULL DEFAULT 1, updated_by_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_shifts_day ON public.btb_shifts(shift_date,employee_id);

CREATE TABLE IF NOT EXISTS public.btb_shift_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL DEFAULT 'Between the Buns' CHECK (restaurant_name = 'Between the Buns'),
  check_date date NOT NULL, check_type text NOT NULL CHECK (check_type IN ('opening','closing')),
  items jsonb NOT NULL DEFAULT '[]', done_count integer NOT NULL DEFAULT 0, total_count integer NOT NULL DEFAULT 20,
  completed boolean NOT NULL DEFAULT false, notes text NOT NULL DEFAULT '',
  saved_by uuid REFERENCES public.btb_employees(id), saved_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
  UNIQUE(restaurant_name,check_date,check_type)
);
CREATE TABLE IF NOT EXISTS public.btb_check_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sheet_id uuid NOT NULL REFERENCES public.btb_shift_checks(id),
  version integer NOT NULL, items jsonb NOT NULL, notes text NOT NULL DEFAULT '',
  saved_by uuid REFERENCES public.btb_employees(id), saved_by_name text, saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sheet_id,version)
);

CREATE TABLE IF NOT EXISTS public.btb_order_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL DEFAULT 'Between the Buns' CHECK (restaurant_name = 'Between the Buns'),
  order_date date NOT NULL, lines jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1,
  saved_by uuid REFERENCES public.btb_employees(id), saved_by_name text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restaurant_name,order_date)
);
CREATE TABLE IF NOT EXISTS public.btb_order_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sheet_id uuid NOT NULL REFERENCES public.btb_order_sheets(id),
  order_date date NOT NULL, lines jsonb NOT NULL, version integer NOT NULL,
  saved_by_name text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(sheet_id,version)
);
-- No retention/purge function targets these order snapshots or their revisions.

ALTER TABLE public.training_topics ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.training_topics ADD COLUMN IF NOT EXISTS video_url text;
CREATE TABLE IF NOT EXISTS public.btb_training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  topic_id uuid NOT NULL REFERENCES public.training_topics(id), topic_revision integer NOT NULL,
  completed_sections uuid[] NOT NULL DEFAULT '{}', reviewed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','pending','approved','changes_requested')),
  notes text NOT NULL DEFAULT '', submitted_at timestamptz,
  reviewed_at timestamptz, reviewed_by uuid REFERENCES public.btb_employees(id), reviewed_by_name text, review_notes text,
  version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(employee_id,topic_id)
);
CREATE TABLE IF NOT EXISTS public.btb_training_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES public.btb_training_records(id),
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id), topic_id uuid NOT NULL REFERENCES public.training_topics(id),
  topic_revision integer NOT NULL, completed_sections uuid[] NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','changes_requested')),
  reviewer_id uuid REFERENCES public.btb_employees(id), reviewer_name text NOT NULL,
  notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.btb_franchise_tasks (
  task_key text PRIMARY KEY, phase text NOT NULL, task text NOT NULL, custom boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false, done_by_name text, done_at timestamptz, version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.btb_staff_licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL DEFAULT 'Between the Buns' CHECK (restaurant_name = 'Between the Buns'),
  employee_id uuid REFERENCES public.btb_employees(id), staff_name text NOT NULL,
  license_type text NOT NULL, file_name text, file_url text, file_size integer,
  issue_date date, expiry_date date, notes text NOT NULL DEFAULT '',
  uploaded_by uuid REFERENCES public.btb_employees(id), uploaded_by_name text,
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.btb_notification_settings (
  restaurant_name text PRIMARY KEY DEFAULT 'Between the Buns' CHECK (restaurant_name = 'Between the Buns'),
  manager_emails text[] NOT NULL DEFAULT '{}', corporate_emails text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false, lead_days integer[] NOT NULL DEFAULT '{60,30,15,7}',
  version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz, last_run_error text
);
INSERT INTO public.btb_notification_settings(restaurant_name) VALUES ('Between the Buns') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.btb_licence_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL CHECK (source IN ('business','staff','tax')),
  document_id text NOT NULL, document_name text NOT NULL, expiry_date date NOT NULL, lead_days integer NOT NULL,
  recipient text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, lease_token uuid,
  first_attempt_at timestamptz, delivery_uncertain boolean NOT NULL DEFAULT false,
  provider_id text, error text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source,document_id,expiry_date,lead_days,recipient)
);

-- Import the existing company-wide BTB records. Site-scoped source rows stay intact.
-- A duplicate roster email is left without a login until a manager supplies a unique address.
INSERT INTO public.btb_employees(id,name,email,phone,position,created_at)
SELECT id,name,CASE WHEN email_rank=1 AND NOT EXISTS (SELECT 1 FROM public.btb_employees e WHERE lower(e.email)=lower(s.email)) THEN nullif(lower(trim(email)),'') ELSE NULL END,
  phone,position,coalesce(created_at,now())
FROM (SELECT s.*,row_number() OVER(PARTITION BY lower(trim(email)) ORDER BY created_at,id) AS email_rank FROM public.staff_members s WHERE location_id IS NULL) s
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.btb_shifts(id,employee_id,shift_date,start_time,end_time,updated_by_name)
SELECT s.id,s.staff_member_id,s.shift_date,s.start_time,s.end_time,'Imported roster'
FROM public.staff_shifts s JOIN public.btb_employees e ON e.id=s.staff_member_id WHERE s.location_id IS NULL
ON CONFLICT(id) DO NOTHING;
-- The arbiter for the legacy import is the 3-column unique key. Fresh installs
-- get it from the table definition. Drifted installs (where a later migration
-- replaced it with the scoped index) need it recreated so this import has a
-- conflict target at all.
CREATE UNIQUE INDEX IF NOT EXISTS btb_shift_checks_legacy_key
  ON public.btb_shift_checks(restaurant_name,check_date,check_type);
INSERT INTO public.btb_shift_checks(id,check_date,check_type,items,done_count,total_count,completed,updated_at,saved_by_name)
SELECT id,check_date,check_type,items,done_count,total_count,completed,coalesce(updated_at,now()),'Legacy record · staff not recorded'
FROM (SELECT c.*,row_number() OVER(PARTITION BY check_date,check_type ORDER BY updated_at DESC NULLS LAST,id DESC) AS rank
  FROM public.btb_checklists c WHERE restaurant_name='Between the Buns' AND location_id IS NULL) c
WHERE rank=1 ON CONFLICT(restaurant_name,check_date,check_type) DO NOTHING;
INSERT INTO public.btb_order_sheets(order_date,lines,saved_by_name,saved_at)
SELECT order_date,jsonb_agg(jsonb_build_object('item_name',item_name,'par',par,'on_hand',on_hand) ORDER BY item_name),'Imported order',coalesce(max(created_at),now())
FROM (SELECT s.*,row_number() OVER(PARTITION BY order_date,item_name ORDER BY created_at DESC NULLS LAST,id DESC) AS rank
  FROM public.order_sheets s WHERE restaurant_name='Between the Buns' AND location_id IS NULL) s
WHERE rank=1 GROUP BY order_date ON CONFLICT(restaurant_name,order_date) DO NOTHING;
INSERT INTO public.btb_order_revisions(sheet_id,order_date,lines,version,saved_by_name,saved_at)
SELECT id,order_date,lines,version,saved_by_name,saved_at FROM public.btb_order_sheets ON CONFLICT(sheet_id,version) DO NOTHING;
INSERT INTO public.btb_check_revisions(sheet_id,version,items,notes,saved_by,saved_by_name,saved_at)
SELECT id,version,items,notes,saved_by,saved_by_name,updated_at FROM public.btb_shift_checks ON CONFLICT(sheet_id,version) DO NOTHING;
INSERT INTO public.btb_franchise_tasks(task_key,phase,task,custom,done,done_by_name)
SELECT 'legacy-'||id::text,phase,task,true,coalesce(done,false),CASE WHEN done THEN 'Legacy record · staff not recorded' END
FROM public.new_restaurant_tasks WHERE restaurant_name='Between the Buns' ON CONFLICT(task_key) DO NOTHING;
INSERT INTO public.btb_staff_licences(id,staff_name,license_type,file_name,file_url,file_size,issue_date,expiry_date,notes,created_at,uploaded_by_name)
SELECT id,staff_name,license_type,file_name,file_url,(to_jsonb(l)->>'file_size')::integer,issue_date,expiry_date,coalesce(notes,''),coalesce(created_at,now()),'Imported certificate'
FROM public.staff_licenses l WHERE restaurant_name='Between the Buns' ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.btb_consume_login_attempt(p_key text)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
DECLARE count integer;
BEGIN
  INSERT INTO btb_login_limits AS limits(key,attempts,window_start) VALUES(p_key,1,now())
  ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN limits.window_start < now()-interval '15 minutes' THEN 1 ELSE limits.attempts+1 END,
    window_start=CASE WHEN limits.window_start < now()-interval '15 minutes' THEN now() ELSE limits.window_start END
  RETURNING attempts INTO count;
  DELETE FROM btb_login_limits WHERE window_start < now()-interval '1 day';
  RETURN count<=10;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_employee(p_id uuid,p_version integer,p_name text,p_email text,p_phone text,p_position text,p_role text,p_active boolean,p_password_hash text)
RETURNS SETOF public.btb_employees LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_employees; saved btb_employees;
BEGIN
  IF p_id IS NULL THEN
    IF p_version<>0 OR p_password_hash IS NULL THEN RAISE EXCEPTION 'Initial password required'; END IF;
    INSERT INTO btb_employees(name,email,phone,position,role,active,login_enabled) VALUES(p_name,p_email,p_phone,p_position,p_role,p_active,true) RETURNING * INTO saved;
  ELSE
    SELECT * INTO current FROM btb_employees WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR current.version<>p_version THEN RAISE EXCEPTION 'Stale employee' USING ERRCODE='40001'; END IF;
    UPDATE btb_employees SET name=p_name,email=p_email,phone=p_phone,position=p_position,role=p_role,active=p_active,
      login_enabled=(current.login_enabled OR p_password_hash IS NOT NULL),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO saved;
    IF current.role<>p_role OR current.email IS DISTINCT FROM p_email OR current.active<>p_active THEN
      UPDATE btb_employee_credentials SET session_version=session_version+1,updated_at=now() WHERE employee_id=p_id;
    END IF;
  END IF;
  IF p_password_hash IS NOT NULL THEN
    INSERT INTO btb_employee_credentials AS credentials(employee_id,password_hash) VALUES(saved.id,p_password_hash)
    ON CONFLICT(employee_id) DO UPDATE SET password_hash=excluded.password_hash,session_version=credentials.session_version+1,updated_at=now();
  END IF;
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_shift(p_id uuid,p_version integer,p_employee_id uuid,p_date date,p_start text,p_end text,p_next_day boolean,p_duty text,p_actor text)
RETURNS SETOF public.btb_shifts LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_shifts; saved btb_shifts; start_at timestamp; end_at timestamp;
BEGIN
  -- Serialize timetable edits, including a shift moved between two employees.
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-schedule',0));
  IF NOT EXISTS(SELECT 1 FROM btb_employees WHERE id=p_employee_id AND active) THEN RAISE EXCEPTION 'Employee is inactive'; END IF;
  SELECT * INTO current FROM btb_shifts WHERE id=p_id FOR UPDATE;
  IF coalesce(current.version,0)<>p_version OR (p_id IS NOT NULL AND current.id IS NULL) THEN RAISE EXCEPTION 'Stale shift' USING ERRCODE='40001'; END IF;
  start_at:=p_date+p_start::time; end_at:=p_date+p_end::time+CASE WHEN p_next_day THEN interval '1 day' ELSE interval '0' END;
  IF end_at<=start_at OR end_at-start_at>interval '1 day' THEN RAISE EXCEPTION 'Invalid shift times'; END IF;
  IF EXISTS(SELECT 1 FROM btb_shifts WHERE employee_id=p_employee_id AND id IS DISTINCT FROM p_id
    AND shift_date+start_time::time<end_at AND shift_date+end_time::time+CASE WHEN ends_next_day THEN interval '1 day' ELSE interval '0' END>start_at) THEN
    RAISE EXCEPTION 'Overlapping shift' USING ERRCODE='23P01';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO btb_shifts(employee_id,shift_date,start_time,end_time,ends_next_day,duty,updated_by_name)
    VALUES(p_employee_id,p_date,p_start,p_end,p_next_day,p_duty,p_actor) RETURNING * INTO saved;
  ELSE
    UPDATE btb_shifts SET employee_id=p_employee_id,shift_date=p_date,start_time=p_start,end_time=p_end,ends_next_day=p_next_day,duty=p_duty,
      updated_by_name=p_actor,updated_at=now(),version=version+1 WHERE id=p_id RETURNING * INTO saved;
  END IF;
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_shift_check(p_date date,p_type text,p_version integer,p_items jsonb,p_notes text,p_employee_id uuid,p_actor text)
RETURNS SETOF public.btb_shift_checks LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_shift_checks; saved btb_shift_checks; done integer; total integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-check:'||p_date::text||':'||p_type,0));
  SELECT * INTO current FROM btb_shift_checks WHERE restaurant_name='Between the Buns' AND check_date=p_date AND check_type=p_type FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Stale checklist' USING ERRCODE='40001'; END IF;
  total:=jsonb_array_length(p_items);
  SELECT count(*) INTO done FROM jsonb_array_elements(p_items) item WHERE (item->>'completed')::boolean;
  INSERT INTO btb_shift_checks(check_date,check_type,items,notes,done_count,total_count,completed,saved_by,saved_by_name,version)
  VALUES(p_date,p_type,p_items,p_notes,done,total,done=total AND total>0,p_employee_id,p_actor,p_version+1)
  ON CONFLICT(restaurant_name,check_date,check_type) DO UPDATE SET items=excluded.items,notes=excluded.notes,done_count=excluded.done_count,total_count=excluded.total_count,
    completed=excluded.completed,saved_by=excluded.saved_by,saved_by_name=excluded.saved_by_name,version=excluded.version,updated_at=now() RETURNING * INTO saved;
  INSERT INTO btb_check_revisions(sheet_id,version,items,notes,saved_by,saved_by_name) VALUES(saved.id,saved.version,saved.items,saved.notes,p_employee_id,p_actor);
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_order(p_date date,p_lines jsonb,p_version integer,p_employee_id uuid,p_actor text)
RETURNS SETOF public.btb_order_sheets LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current btb_order_sheets; saved btb_order_sheets;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-order:'||p_date::text,0));
  SELECT * INTO current FROM btb_order_sheets WHERE restaurant_name='Between the Buns' AND order_date=p_date FOR UPDATE;
  IF coalesce(current.version,0)<>p_version THEN RAISE EXCEPTION 'Stale order' USING ERRCODE='40001'; END IF;
  INSERT INTO btb_order_sheets(order_date,lines,version,saved_by,saved_by_name) VALUES(p_date,p_lines,p_version+1,p_employee_id,p_actor)
  ON CONFLICT(restaurant_name,order_date) DO UPDATE SET lines=excluded.lines,version=excluded.version,saved_by=excluded.saved_by,saved_by_name=excluded.saved_by_name,saved_at=now() RETURNING * INTO saved;
  INSERT INTO btb_order_revisions(sheet_id,order_date,lines,version,saved_by_name) VALUES(saved.id,p_date,p_lines,saved.version,p_actor);
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_training_topic(p_id uuid,p_revision integer,p_title text,p_category text,p_minutes integer,p_published boolean,p_video text,p_sections jsonb,p_actor text)
RETURNS SETOF public.training_topics LANGUAGE plpgsql SET search_path=public AS $$
DECLARE current training_topics; saved training_topics; item jsonb; next_position integer;
BEGIN
  IF p_id IS NULL THEN
    IF p_revision<>0 THEN RAISE EXCEPTION 'Stale module' USING ERRCODE='40001'; END IF;
    SELECT coalesce(max(position),0)+1 INTO next_position FROM training_topics WHERE location_id IS NULL;
    INSERT INTO training_topics(title,category,est_minutes,published,video_url,position,created_by,location_id)
    VALUES(p_title,p_category,p_minutes,p_published,nullif(p_video,''),next_position,p_actor,NULL) RETURNING * INTO saved;
  ELSE
    SELECT * INTO current FROM training_topics WHERE id=p_id AND location_id IS NULL FOR UPDATE;
    IF NOT FOUND OR current.revision<>p_revision THEN RAISE EXCEPTION 'Stale module' USING ERRCODE='40001'; END IF;
    UPDATE training_topics SET title=p_title,category=p_category,est_minutes=p_minutes,published=p_published,video_url=nullif(p_video,''),revision=revision+1 WHERE id=p_id RETURNING * INTO saved;
    DELETE FROM training_sections WHERE topic_id=p_id;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_sections) LOOP
    INSERT INTO training_sections(id,topic_id,position,heading,body) VALUES((item->>'id')::uuid,saved.id,(item->>'position')::integer,item->>'heading',item->>'body');
  END LOOP;
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_save_training_record(p_employee_id uuid,p_topic_id uuid,p_topic_revision integer,p_version integer,p_sections uuid[],p_reviewed boolean,p_status text,p_notes text)
RETURNS SETOF public.btb_training_records LANGUAGE plpgsql SET search_path=public AS $$
DECLARE topic training_topics; current btb_training_records; saved btb_training_records; section_count integer;
BEGIN
  SELECT * INTO topic FROM training_topics WHERE id=p_topic_id AND location_id IS NULL AND published FOR SHARE;
  IF NOT FOUND OR topic.revision<>p_topic_revision THEN RAISE EXCEPTION 'Module changed' USING ERRCODE='40001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('btb-training:'||p_employee_id::text||':'||p_topic_id::text,0));
  SELECT * INTO current FROM btb_training_records WHERE employee_id=p_employee_id AND topic_id=p_topic_id FOR UPDATE;
  IF coalesce(current.version,0)<>p_version OR (current.topic_revision=p_topic_revision AND current.status IN ('approved','pending')) THEN RAISE EXCEPTION 'Training changed' USING ERRCODE='40001'; END IF;
  IF p_status NOT IN ('in_progress','pending') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_sections) s WHERE NOT EXISTS(SELECT 1 FROM training_sections WHERE id=s AND topic_id=p_topic_id)) THEN RAISE EXCEPTION 'Unknown section'; END IF;
  IF cardinality(p_sections)<>(SELECT count(DISTINCT s) FROM unnest(p_sections) s) THEN RAISE EXCEPTION 'Duplicate section'; END IF;
  SELECT count(*) INTO section_count FROM training_sections WHERE topic_id=p_topic_id;
  IF p_status='pending' AND (NOT p_reviewed OR cardinality(p_sections)<>section_count OR (section_count=0 AND coalesce(topic.video_url,'')='')) THEN RAISE EXCEPTION 'Review every section first'; END IF;
  INSERT INTO btb_training_records(employee_id,topic_id,topic_revision,completed_sections,reviewed,status,notes,submitted_at,version)
  VALUES(p_employee_id,p_topic_id,p_topic_revision,p_sections,p_reviewed,p_status,p_notes,CASE WHEN p_status='pending' THEN now() END,p_version+1)
  ON CONFLICT(employee_id,topic_id) DO UPDATE SET topic_revision=excluded.topic_revision,completed_sections=excluded.completed_sections,reviewed=excluded.reviewed,status=excluded.status,
    notes=excluded.notes,submitted_at=excluded.submitted_at,reviewed_at=NULL,reviewed_by=NULL,reviewed_by_name=NULL,review_notes=NULL,version=excluded.version,updated_at=now() RETURNING * INTO saved;
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_review_training(p_id uuid,p_version integer,p_decision text,p_notes text,p_reviewer uuid,p_actor text)
RETURNS SETOF public.btb_training_records LANGUAGE plpgsql SET search_path=public AS $$
DECLARE topic training_topics; current btb_training_records; saved btb_training_records;
BEGIN
  SELECT t.* INTO topic FROM training_topics t JOIN btb_training_records r ON r.topic_id=t.id WHERE r.id=p_id FOR SHARE OF t;
  SELECT * INTO current FROM btb_training_records WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR topic.id IS NULL OR topic.location_id IS NOT NULL OR current.version<>p_version OR current.status<>'pending' OR current.topic_revision<>topic.revision OR NOT topic.published THEN RAISE EXCEPTION 'Training changed' USING ERRCODE='40001'; END IF;
  IF p_reviewer=current.employee_id THEN RAISE EXCEPTION 'Cannot approve own training'; END IF;
  IF p_decision NOT IN ('approved','changes_requested') OR (p_decision='changes_requested' AND trim(p_notes)='') THEN RAISE EXCEPTION 'Invalid review'; END IF;
  UPDATE btb_training_records SET status=p_decision,review_notes=p_notes,reviewed_by=p_reviewer,reviewed_by_name=p_actor,reviewed_at=now(),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO saved;
  INSERT INTO btb_training_reviews(record_id,employee_id,topic_id,topic_revision,completed_sections,decision,reviewer_id,reviewer_name,notes)
  VALUES(p_id,current.employee_id,current.topic_id,current.topic_revision,current.completed_sections,p_decision,p_reviewer,p_actor,p_notes);
  RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION public.btb_claim_licence_email(p_source text,p_document_id text,p_name text,p_expiry date,p_lead integer,p_recipient text)
RETURNS SETOF public.btb_licence_email_log LANGUAGE plpgsql SET search_path=public AS $$
DECLARE job btb_licence_email_log;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM btb_notification_settings WHERE restaurant_name='Between the Buns' AND enabled
    AND p_recipient=ANY(manager_emails||corporate_emails) AND p_lead=ANY(lead_days)) THEN RETURN; END IF;
  IF p_source='business' AND NOT EXISTS(SELECT 1 FROM compliance_documents WHERE id::text=p_document_id
    AND restaurant_name='Between the Buns' AND location_id IS NULL AND expiry_date=p_expiry) THEN RETURN; END IF;
  IF p_source='staff' AND NOT EXISTS(SELECT 1 FROM btb_staff_licences WHERE id::text=p_document_id
    AND restaurant_name='Between the Buns' AND expiry_date=p_expiry) THEN RETURN; END IF;
  IF p_source='tax' AND NOT EXISTS(SELECT 1 FROM corporate_dates WHERE id::text=p_document_id AND due_date=p_expiry) THEN RETURN; END IF;
  INSERT INTO btb_licence_email_log(source,document_id,document_name,expiry_date,lead_days,recipient)
  VALUES(p_source,p_document_id,p_name,p_expiry,p_lead,p_recipient) ON CONFLICT(source,document_id,expiry_date,lead_days,recipient) DO NOTHING;
  SELECT * INTO job FROM btb_licence_email_log WHERE source=p_source AND document_id=p_document_id AND expiry_date=p_expiry AND lead_days=p_lead AND recipient=p_recipient FOR UPDATE;
  IF job.status='sent' OR job.attempts>=3 OR (job.lease_until IS NOT NULL AND job.lease_until>now()) THEN RETURN; END IF;
  IF job.delivery_uncertain AND job.first_attempt_at<=now()-interval '23 hours' THEN RETURN; END IF;
  UPDATE btb_licence_email_log SET status='sending',attempts=attempts+1,lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid(),
    first_attempt_at=coalesce(first_attempt_at,now()),delivery_uncertain=true,error=NULL WHERE id=job.id RETURNING * INTO job;
  RETURN NEXT job;
END $$;

-- BTB authentication is checked by the server. Browsers never read credentials
-- or mutate employees, approvals, schedules or email jobs directly.
DO $$
DECLARE tab text; func record;
BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_employees','btb_employee_credentials','btb_login_limits','btb_shifts','btb_shift_checks','btb_check_revisions','btb_order_sheets','btb_order_revisions',
    'btb_training_records','btb_training_reviews','btb_franchise_tasks','btb_staff_licences','btb_notification_settings','btb_licence_email_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  END LOOP;
  -- The BTB training UI now reads and publishes through authenticated server routes.
  REVOKE ALL ON public.training_topics,public.training_sections FROM PUBLIC,anon,authenticated;
  GRANT ALL ON public.training_topics,public.training_sections TO service_role;
  FOR func IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('btb_consume_login_attempt','btb_save_employee','btb_save_shift','btb_save_shift_check','btb_save_order','btb_save_training_topic','btb_save_training_record','btb_review_training','btb_claim_licence_email') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',func.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',func.signature);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
