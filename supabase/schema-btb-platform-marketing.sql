-- Release 09: extend the existing promotions and social calendar, not a second board.
BEGIN;
CREATE TABLE IF NOT EXISTS btb_design_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
  width numeric, height numeric, unit text CHECK(unit IN ('in','ft','px','mm','cm')),
  active boolean NOT NULL DEFAULT true, CHECK((width IS NULL AND height IS NULL) OR (width>0 AND height>0 AND unit IS NOT NULL))
);
INSERT INTO btb_design_formats(name,width,height,unit) VALUES('8 × 11 inches',8,11,'in'),('5 × 10 feet',5,10,'ft'),('Menu',NULL,NULL,NULL),('Social media',NULL,NULL,'px'),('Custom',NULL,NULL,NULL) ON CONFLICT(name) DO NOTHING;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS workflow_status text CHECK(workflow_status IN ('draft','submitted','pending_approval','approved','rejected','assigned','in_progress','awaiting_feedback','revision_requested','completed','cancelled'));
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS purpose text;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS format_id uuid REFERENCES btb_design_formats(id);
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS dimensions jsonb;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS required_file_type text;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS promotion_start date;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS promotion_end date;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS delivery_date date;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent'));
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS reference_files uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES btb_employees(id);
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES btb_employees(id);
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS decision_reason text;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE IF NOT EXISTS btb_design_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), promotion_id uuid NOT NULL REFERENCES marketing_promotions(id),
  file_id uuid NOT NULL UNIQUE REFERENCES btb_file_objects(id), version integer NOT NULL,
  title text NOT NULL, dimensions jsonb NOT NULL, uploaded_by uuid NOT NULL REFERENCES btb_employees(id),
  uploaded_by_name text NOT NULL, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(promotion_id,version)
);
CREATE TABLE IF NOT EXISTS btb_promotion_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), promotion_id uuid NOT NULL REFERENCES marketing_promotions(id),
  author_id uuid NOT NULL REFERENCES btb_employees(id), author_name text NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES marketing_promotions(id);
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS design_version_id uuid REFERENCES btb_design_versions(id);
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS campaign_name text;
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS workflow_status text CHECK(workflow_status IN ('planned','design_pending','awaiting_approval','approved','scheduled','published','cancelled'));
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE social_media_calendar ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS btb_social_platforms(name text PRIMARY KEY,active boolean NOT NULL DEFAULT true);
INSERT INTO btb_social_platforms(name) VALUES('Instagram'),('Facebook') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION btb_platform_marketing(p_actor uuid,p_session integer,p_location uuid,p_profile uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current marketing_promotions; saved marketing_promotions; next_status text; reason text; ev uuid; file uuid;
  design btb_design_versions; post social_media_calendar; old_post social_media_calendar; v integer; dimension jsonb; target uuid;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'marketing.read');
  reason:=trim(coalesce(p_data->>'reason',''));
  IF p_action='format' OR p_action='platform' THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.approve');
    IF p_action='format' THEN
      INSERT INTO btb_design_formats(name,width,height,unit) VALUES(p_data->>'name',(p_data->>'width')::numeric,(p_data->>'height')::numeric,p_data->>'unit');
    ELSE INSERT INTO btb_social_platforms(name) VALUES(p_data->>'name') ON CONFLICT(name) DO UPDATE SET active=true; END IF;
    PERFORM btb_event(p_location,'marketing_settings',p_location,p_action,p_actor,NULL,p_data);
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='create' THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.request');
    dimension:=p_data->'dimensions';
    IF coalesce(trim(p_data->>'title'),'')='' OR coalesce(trim(p_data->>'purpose'),'')='' OR coalesce((dimension->>'width')::numeric,0)<=0 OR coalesce((dimension->>'height')::numeric,0)<=0 OR coalesce(dimension->>'unit','') NOT IN ('in','ft','px','mm','cm') THEN RAISE EXCEPTION 'Title, purpose and explicit dimensions are required'; END IF;
    IF p_data->>'promotion_start' IS NULL OR p_data->>'promotion_end' IS NULL OR p_data->>'delivery_date' IS NULL OR coalesce(p_data->>'required_file_type','') NOT IN ('pdf','png','jpg') THEN RAISE EXCEPTION 'Promotion dates, delivery date and file type required'; END IF;
    IF (p_data->>'promotion_end')::date<(p_data->>'promotion_start')::date THEN RAISE EXCEPTION 'Promotion end precedes start'; END IF;
    FOR file IN SELECT jsonb_array_elements_text(coalesce(p_data->'reference_files','[]'))::uuid LOOP
      IF NOT EXISTS(SELECT 1 FROM btb_file_objects WHERE id=file AND location_id=p_location AND purpose='reference' AND owner_id=p_actor) THEN RAISE EXCEPTION 'Invalid reference attachment'; END IF;
    END LOOP;
    INSERT INTO marketing_promotions(id,user_id,restaurant_name,location_id,title,description,month,year,status,workflow_status,purpose,format_id,dimensions,required_file_type,promotion_start,promotion_end,delivery_date,priority,instructions,reference_files,btb_created_by,btb_created_by_name)
    VALUES((p_data->>'id')::uuid,p_profile,'Between the Buns',p_location,p_data->>'title',p_data->>'description',extract(month FROM (p_data->>'promotion_start')::date),extract(year FROM (p_data->>'promotion_start')::date),'planned','draft',
      p_data->>'purpose',(p_data->>'format_id')::uuid,dimension,p_data->>'required_file_type',(p_data->>'promotion_start')::date,(p_data->>'promotion_end')::date,(p_data->>'delivery_date')::date,
      coalesce(p_data->>'priority','normal'),p_data->>'instructions',ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'reference_files','[]'))::uuid),p_actor,actor.name) RETURNING * INTO saved;
    PERFORM btb_event(p_location,'promotion',saved.id,'draft',p_actor,NULL,to_jsonb(saved));
    RETURN to_jsonb(saved);
  ELSIF p_action='calendar' THEN
    IF actor.role NOT IN ('designer','corporate','owner') THEN RAISE EXCEPTION 'Designer or corporate calendar access required' USING ERRCODE='42501'; END IF;
    SELECT * INTO current FROM marketing_promotions WHERE id=(p_data->>'promotion_id')::uuid AND location_id=p_location AND approved_at IS NOT NULL AND workflow_status NOT IN ('rejected','cancelled');
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an approved promotion'; END IF;
    IF actor.role='designer' AND current.assigned_to IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Assigned designer required' USING ERRCODE='42501'; END IF;
    SELECT * INTO old_post FROM social_media_calendar WHERE id=nullif(p_data->>'id','')::uuid AND location_id=p_location FOR UPDATE;
    IF old_post.id IS NOT NULL AND old_post.promotion_id<>current.id THEN RAISE EXCEPTION 'Calendar campaign cannot be replaced'; END IF;
    IF nullif(p_data->>'id','') IS NOT NULL AND old_post.id IS NULL THEN RAISE EXCEPTION 'Calendar entry not in this location' USING ERRCODE='42501'; END IF;
    IF coalesce(old_post.version,0)<>coalesce((p_data->>'version')::integer,-1) THEN RAISE EXCEPTION 'Calendar entry changed' USING ERRCODE='40001'; END IF;
    next_status:=p_data->>'status';
    IF next_status='approved' AND actor.role NOT IN ('corporate','owner') THEN RAISE EXCEPTION 'Corporate calendar approval required' USING ERRCODE='42501'; END IF;
    IF next_status IN ('scheduled','published') AND coalesce(old_post.workflow_status,'') NOT IN ('approved','scheduled','published') THEN RAISE EXCEPTION 'Approve content before scheduling'; END IF;
    IF next_status IN ('approved','scheduled','published') AND old_post.id IS NULL THEN RAISE EXCEPTION 'Save a draft before approval'; END IF;
    IF NOT EXISTS(SELECT 1 FROM btb_social_platforms WHERE name=p_data->>'platform' AND active) THEN RAISE EXCEPTION 'Choose a configured platform'; END IF;
    IF nullif(p_data->>'design_version_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_design_versions WHERE id=(p_data->>'design_version_id')::uuid AND promotion_id=current.id) THEN RAISE EXCEPTION 'Artwork does not belong to this campaign'; END IF;
    -- Changing approved copy/artwork invalidates approval rather than bypassing it.
    IF old_post.workflow_status IN ('approved','scheduled','published') AND actor.role='designer' AND
      (old_post.caption IS DISTINCT FROM p_data->>'description' OR old_post.design_version_id IS DISTINCT FROM nullif(p_data->>'design_version_id','')::uuid) THEN next_status:='awaiting_approval'; END IF;
    INSERT INTO social_media_calendar(id,user_id,restaurant_name,location_id,day,channel,caption,post_date,title,campaign_name,promotion_id,design_version_id,scheduled_at,workflow_status,notes,version,btb_created_by,btb_created_by_name)
    VALUES(coalesce(old_post.id,gen_random_uuid()),p_profile,'Between the Buns',p_location,extract(isodow FROM (p_data->>'scheduled_at')::timestamptz)::integer-1,p_data->>'platform',p_data->>'description',(p_data->>'scheduled_at')::timestamptz::date,
      p_data->>'title',p_data->>'campaign_name',current.id,nullif(p_data->>'design_version_id','')::uuid,(p_data->>'scheduled_at')::timestamptz,next_status,p_data->>'notes',coalesce(old_post.version,0)+1,p_actor,actor.name)
    ON CONFLICT(id) DO UPDATE SET channel=excluded.channel,caption=excluded.caption,post_date=excluded.post_date,title=excluded.title,campaign_name=excluded.campaign_name,design_version_id=excluded.design_version_id,scheduled_at=excluded.scheduled_at,workflow_status=excluded.workflow_status,notes=excluded.notes,version=excluded.version RETURNING * INTO post;
    PERFORM btb_event(p_location,'calendar',post.id,'save',p_actor,to_jsonb(old_post),to_jsonb(post));
    RETURN to_jsonb(post);
  END IF;
  SELECT * INTO current FROM marketing_promotions WHERE id=(p_data->>'id')::uuid AND location_id=p_location AND workflow_status IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
  IF actor.role='designer' AND current.approved_at IS NULL THEN RAISE EXCEPTION 'Corporate approval required before design work' USING ERRCODE='42501'; END IF;
  IF current.version<>coalesce((p_data->>'version')::integer,-1) THEN RAISE EXCEPTION 'Request changed; reload' USING ERRCODE='40001'; END IF;
  IF p_action='comment' THEN
    IF coalesce(trim(p_data->>'body'),'')='' THEN RAISE EXCEPTION 'Comment required'; END IF;
    INSERT INTO btb_promotion_comments(promotion_id,author_id,author_name,body) VALUES(current.id,p_actor,actor.name,p_data->>'body');
    ev:=btb_event(p_location,'promotion',current.id,'comment',p_actor,NULL,jsonb_build_object('body',p_data->>'body'));
    PERFORM btb_notify(p_location,ARRAY['manager','corporate','designer'],'comment:'||ev,'New promotion feedback',p_data->>'body','/between-the-buns/platform?module=marketing&record='||current.id,ev);
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='upload' THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.design');
    IF current.approved_at IS NULL OR current.workflow_status NOT IN ('in_progress','revision_requested','awaiting_feedback') OR (actor.role='designer' AND current.assigned_to IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Approved, assigned production work required' USING ERRCODE='42501'; END IF;
    file:=(p_data->>'file_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM btb_file_objects WHERE id=file AND location_id=p_location AND purpose='artwork' AND owner_id=p_actor) THEN RAISE EXCEPTION 'Invalid artwork file'; END IF;
    SELECT coalesce(max(version),0)+1 INTO v FROM btb_design_versions WHERE promotion_id=current.id;
    INSERT INTO btb_design_versions(promotion_id,file_id,version,title,dimensions,uploaded_by,uploaded_by_name,notes)
      VALUES(current.id,file,v,current.title,current.dimensions,p_actor,actor.name,coalesce(p_data->>'notes','')) RETURNING * INTO design;
    next_status:='awaiting_feedback';
  ELSIF p_action='submit' AND current.workflow_status IN ('draft','rejected') THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.request');
    PERFORM btb_event(p_location,'promotion',current.id,'submitted',p_actor,to_jsonb(current),jsonb_build_object('workflow_status','submitted'));
    next_status:='pending_approval';
  ELSIF p_action IN ('approve','reject') AND current.workflow_status='pending_approval' THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.approve');
    IF current.btb_created_by=p_actor THEN RAISE EXCEPTION 'A different corporate approver must review your request' USING ERRCODE='42501'; END IF;
    IF p_action='reject' AND reason='' THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
    next_status:=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END;
  ELSIF p_action='assign' AND current.approved_at IS NOT NULL AND current.workflow_status IN ('approved','assigned') THEN
    IF actor.role NOT IN ('designer','corporate','owner') THEN RAISE EXCEPTION 'Assignment not permitted' USING ERRCODE='42501'; END IF;
    target:=coalesce(nullif(p_data->>'designer_id','')::uuid,p_actor);
    IF actor.role='designer' AND target<>p_actor THEN RAISE EXCEPTION 'Designers may claim only their own work' USING ERRCODE='42501'; END IF;
    IF actor.role='designer' AND current.assigned_to IS NOT NULL AND current.assigned_to<>p_actor THEN RAISE EXCEPTION 'This request is assigned to another designer' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS(SELECT 1 FROM btb_employees WHERE id=target AND role='designer' AND active AND login_enabled) THEN RAISE EXCEPTION 'Choose an active designer'; END IF;
    next_status:='assigned';
  ELSIF p_action='start' AND current.workflow_status IN ('assigned','revision_requested') AND current.approved_at IS NOT NULL THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.design');
    IF actor.role='designer' AND current.assigned_to IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Assigned designer required' USING ERRCODE='42501'; END IF;
    next_status:='in_progress';
  ELSIF p_action='revision' AND current.workflow_status IN ('awaiting_feedback','completed') THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.request');
    IF reason='' THEN RAISE EXCEPTION 'Revision feedback required'; END IF;
    next_status:='revision_requested';
  ELSIF p_action='complete' AND current.workflow_status='awaiting_feedback' THEN
    IF actor.role='designer' AND current.assigned_to IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Assigned designer required' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS(SELECT 1 FROM btb_design_versions WHERE promotion_id=current.id) THEN RAISE EXCEPTION 'Upload final artwork first'; END IF;
    next_status:='completed';
  ELSIF p_action='cancel' AND current.workflow_status NOT IN ('completed','cancelled') THEN
    PERFORM btb_platform_assert(p_actor,p_session,p_location,'marketing.request');
    IF reason='' THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
    next_status:='cancelled';
  ELSE RAISE EXCEPTION 'This status transition is not permitted' USING ERRCODE='42501'; END IF;
  UPDATE marketing_promotions SET workflow_status=next_status,version=version+1,updated_at=now(),
    approved_at=CASE WHEN p_action='approve' THEN now() WHEN p_action='submit' THEN NULL ELSE approved_at END,
    approved_by=CASE WHEN p_action='approve' THEN p_actor WHEN p_action='submit' THEN NULL ELSE approved_by END,
    assigned_to=CASE WHEN p_action='assign' THEN target ELSE assigned_to END,decision_reason=CASE WHEN reason<>'' THEN reason ELSE decision_reason END,
    completed_at=CASE WHEN next_status='completed' THEN now() ELSE completed_at END,
    status=CASE WHEN next_status='completed' THEN 'completed' WHEN next_status IN ('in_progress','awaiting_feedback') THEN 'active' ELSE status END
    WHERE id=current.id RETURNING * INTO saved;
  ev:=btb_event(p_location,'promotion',saved.id,next_status,p_actor,to_jsonb(current),to_jsonb(saved),reason);
  PERFORM btb_notify(p_location,CASE WHEN next_status='pending_approval' THEN ARRAY['corporate','owner'] WHEN next_status='rejected' THEN ARRAY['manager'] ELSE ARRAY['manager','corporate','designer'] END,
    'promotion:'||ev,saved.title||' · '||replace(next_status,'_',' '),coalesce(nullif(reason,''),'Open the request to review its current status and artwork.'),'/between-the-buns/platform?module=marketing&record='||saved.id,ev);
  RETURN to_jsonb(saved);
END $$;

DO $$ DECLARE tab text; f record; BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_design_formats','btb_design_versions','btb_promotion_comments','btb_social_platforms'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',tab); EXECUTE format('GRANT ALL ON %I TO service_role',tab);
  END LOOP;
  REVOKE UPDATE,DELETE ON btb_design_versions FROM service_role;
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'btb_platform_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
