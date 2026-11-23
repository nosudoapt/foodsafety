-- Step 51: sign-in hardening with a durable audit trail.
--
-- Two problems with the earlier limiter (btb_consume_login_attempt):
--   1. it counted every attempt, including successful sign-ins, keyed only by
--      email — so ten ordinary sign-ins in a quarter hour locked the person out;
--   2. it ran before the password check, so a correct password was refused.
--   3. it kept no history, so "who is hammering the login" was unanswerable.
--
-- This migration adds a per-IP failure throttle (checked before verifying),
-- counts only failures per email, clears the counter on success, and records
-- every attempt for review in the console.
BEGIN;

CREATE TABLE IF NOT EXISTS public.btb_auth_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.btb_auth_ip_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.btb_login_events (
  id bigserial PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('employee','console')),
  email text NOT NULL,
  email_hash text NOT NULL,
  ip text,
  outcome text NOT NULL CHECK (outcome IN ('success','bad_password','no_account','disabled','blocked','ip_blocked','shared_refused','branch_refused')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_login_events_recent ON public.btb_login_events(created_at DESC);
CREATE INDEX IF NOT EXISTS btb_login_events_email ON public.btb_login_events(email_hash, created_at DESC);

-- Checked BEFORE verifying a password: stops one client spraying many emails.
CREATE OR REPLACE FUNCTION public.btb_auth_check_ip(p_scope text, p_ip text)
RETURNS TABLE(blocked boolean, retry_after integer)
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE attempts integer; win timestamptz;
BEGIN
  IF p_ip IS NULL OR p_ip = '' THEN RETURN QUERY SELECT false, 0; RETURN; END IF;
  SELECT i.attempts, i.window_start INTO attempts, win
    FROM public.btb_auth_ip_limits i WHERE i.key = p_scope||':'||p_ip;
  IF NOT FOUND OR win < now()-interval '15 minutes' OR attempts <= 30 THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;
  RETURN QUERY SELECT true, GREATEST(0, 900 - EXTRACT(EPOCH FROM (now()-win))::int);
END $$;

-- Called only after a refused password. Ten failures per email per quarter hour.
CREATE OR REPLACE FUNCTION public.btb_auth_note_failure(p_scope text, p_key text, p_ip text, p_email text, p_outcome text)
RETURNS TABLE(blocked boolean, attempts integer, retry_after integer)
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE email_attempts integer; ip_attempts integer; email_window timestamptz; ip_window timestamptz; is_blocked boolean;
BEGIN
  INSERT INTO public.btb_auth_limits AS l(key,attempts,window_start) VALUES(p_scope||':'||p_key,1,now())
  ON CONFLICT (key) DO UPDATE SET
    attempts = CASE WHEN l.window_start < now()-interval '15 minutes' THEN 1 ELSE l.attempts+1 END,
    window_start = CASE WHEN l.window_start < now()-interval '15 minutes' THEN now() ELSE l.window_start END
  RETURNING l.attempts, l.window_start INTO email_attempts, email_window;

  ip_attempts := 0; ip_window := now();
  IF p_ip IS NOT NULL AND p_ip <> '' THEN
    INSERT INTO public.btb_auth_ip_limits AS i(key,attempts,window_start) VALUES(p_scope||':'||p_ip,1,now())
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN i.window_start < now()-interval '15 minutes' THEN 1 ELSE i.attempts+1 END,
      window_start = CASE WHEN i.window_start < now()-interval '15 minutes' THEN now() ELSE i.window_start END
    RETURNING i.attempts, i.window_start INTO ip_attempts, ip_window;
  END IF;

  is_blocked := email_attempts > 10 OR ip_attempts > 30;
  INSERT INTO public.btb_login_events(scope,email,email_hash,ip,outcome)
    VALUES(p_scope, lower(p_email), p_key, p_ip, CASE WHEN is_blocked THEN 'blocked' ELSE p_outcome END);
  DELETE FROM public.btb_auth_limits WHERE window_start < now()-interval '1 day';
  DELETE FROM public.btb_auth_ip_limits WHERE window_start < now()-interval '1 day';
  DELETE FROM public.btb_login_events WHERE created_at < now()-interval '30 days';
  RETURN QUERY SELECT is_blocked, email_attempts, GREATEST(0, 900 - EXTRACT(EPOCH FROM (now()-email_window))::int);
END $$;

-- A correct password always clears the counter for that email.
CREATE OR REPLACE FUNCTION public.btb_auth_note_success(p_scope text, p_key text, p_ip text, p_email text)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  DELETE FROM public.btb_auth_limits WHERE key = p_scope||':'||p_key;
  INSERT INTO public.btb_login_events(scope,email,email_hash,ip,outcome)
    VALUES(p_scope, lower(p_email), p_key, p_ip, 'success');
END $$;

ALTER TABLE public.btb_auth_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.btb_auth_ip_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.btb_login_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_auth_limits,public.btb_auth_ip_limits,public.btb_login_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.btb_login_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.btb_auth_limits,public.btb_auth_ip_limits,public.btb_login_events TO service_role;
GRANT ALL ON SEQUENCE public.btb_login_events_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.btb_auth_check_ip(text,text),public.btb_auth_note_failure(text,text,text,text,text),public.btb_auth_note_success(text,text,text,text) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
