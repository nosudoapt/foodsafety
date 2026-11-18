-- DB-18: suppress unsent location jobs at claim and again before provider send.
-- Cancelled/accepted job evidence and frozen payloads are retained. A provider
-- request already in flight cannot be recalled; do not cancel an active lease
-- from a competing claim or pretend an accepted message was never delivered.
BEGIN;
CREATE OR REPLACE FUNCTION public.btb_claim_email_jobs(p_limit integer DEFAULT 20)
RETURNS SETOF public.btb_email_jobs LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE btb_email_jobs j SET status='cancelled',error='Location closed before delivery',lease_token=NULL,lease_until=NULL
    WHERE j.location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM btb_location_settings s WHERE s.location_id=j.location_id AND s.active)
      AND (j.status IN ('pending','failed') OR (j.status='sending' AND (j.lease_until IS NULL OR j.lease_until<=now())));
  RETURN QUERY WITH due AS (
    SELECT j.id FROM btb_email_jobs j WHERE j.status IN ('pending','failed','sending') AND j.attempts<5 AND j.available_at<=now()
      AND (j.lease_until IS NULL OR j.lease_until<=now()) AND (NOT j.uncertain OR j.first_attempt_at>now()-interval '23 hours')
      AND (j.location_id IS NULL OR EXISTS(SELECT 1 FROM btb_location_settings s WHERE s.location_id=j.location_id AND s.active))
    ORDER BY j.available_at,j.id FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),30)
  ) UPDATE btb_email_jobs j SET status='sending',attempts=j.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',
    first_attempt_at=coalesce(j.first_attempt_at,now()),uncertain=true FROM due WHERE j.id=due.id RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION public.btb_prepare_email_job(p_id uuid,p_lease uuid,p_from text,p_attachment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE job btb_email_jobs;
BEGIN
  SELECT * INTO job FROM btb_email_jobs WHERE id=p_id AND lease_token=p_lease AND status='sending' AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF job.location_id IS NOT NULL THEN
    PERFORM 1 FROM btb_location_settings WHERE location_id=job.location_id AND active FOR SHARE;
    IF NOT FOUND THEN
      UPDATE btb_email_jobs SET status='cancelled',error='Location closed before delivery',lease_until=NULL,lease_token=NULL WHERE id=p_id;
      RETURN NULL;
    END IF;
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
REVOKE ALL ON FUNCTION public.btb_claim_email_jobs(integer),public.btb_prepare_email_job(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.btb_claim_email_jobs(integer),public.btb_prepare_email_job(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
