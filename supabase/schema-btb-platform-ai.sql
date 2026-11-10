-- BTB platform release: AI document extraction settings + usage metering.
-- Apply AFTER schema-btb-platform-inventory.sql.
-- The extractor is an AID, never a writer: it only prefills the existing
-- review/confirm pipeline. Without a configured API key the feature is not
-- operational (the API answers 503), and usage is capped per location per day.
BEGIN;

CREATE TABLE IF NOT EXISTS public.btb_ai_settings (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id),
  enabled boolean NOT NULL DEFAULT false,
  model text,
  -- Service key for an OpenAI-compatible vision endpoint. Never returned by any
  -- RPC or API (only a masked tail is exposed to corporate/owner settings).
  api_key text,
  daily_limit integer NOT NULL DEFAULT 25 CHECK (daily_limit BETWEEN 1 AND 500),
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES public.btb_employees(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.btb_ai_usage (
  location_id uuid NOT NULL REFERENCES public.locations(id),
  day date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (location_id, day)
);

ALTER TABLE public.btb_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.btb_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_ai_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.btb_ai_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.btb_ai_settings TO service_role;
GRANT ALL ON public.btb_ai_usage TO service_role;

-- Corporate/owner only. The stored key itself never leaves the database:
-- callers get presence plus a masked tail for the settings screen.
CREATE OR REPLACE FUNCTION public.btb_ai_settings_get(p_actor uuid,p_session integer,p_location uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE actor btb_employees; s btb_ai_settings;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'settings');
  SELECT * INTO s FROM btb_ai_settings WHERE location_id=p_location;
  RETURN jsonb_build_object('location_id',p_location,
    'enabled',coalesce(s.enabled,false),
    'model',s.model,
    'has_key',s.api_key IS NOT NULL,
    'api_key_masked',CASE WHEN s.api_key IS NULL THEN '' ELSE repeat('*',8)||right(s.api_key,4) END,
    'daily_limit',coalesce(s.daily_limit,25),
    'version',coalesce(s.version,0),
    'updated_at',s.updated_at);
END $$;

-- Save settings. Empty api_key keeps the stored key; remove_key=true clears it.
CREATE OR REPLACE FUNCTION public.btb_ai_settings_put(p_actor uuid,p_session integer,p_location uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; current btb_ai_settings; saved btb_ai_settings; v_limit integer; v_model text;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'settings');
  SELECT * INTO current FROM btb_ai_settings WHERE location_id=p_location FOR UPDATE;
  IF current.location_id IS NOT NULL AND current.version<>coalesce((p_data->>'version')::integer,-1) THEN
    RAISE EXCEPTION 'AI settings changed; reload' USING ERRCODE='40001';
  END IF;
  v_limit:=coalesce(nullif(p_data->>'daily_limit','')::integer,25);
  IF v_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Daily limit must be between 1 and 500'; END IF;
  v_model:=nullif(trim(coalesce(p_data->>'model','')),'');
  INSERT INTO btb_ai_settings(location_id,enabled,model,api_key,daily_limit,version,updated_by,updated_at)
  VALUES(p_location,coalesce((p_data->>'enabled')::boolean,false),v_model,
    CASE WHEN coalesce((p_data->>'remove_key')::boolean,false) THEN NULL
         WHEN coalesce(p_data->>'api_key','')='' THEN NULL
         ELSE left(p_data->>'api_key',500) END,
    v_limit,1,actor.id,now())
  ON CONFLICT(location_id) DO UPDATE SET enabled=excluded.enabled,model=excluded.model,
    api_key=CASE WHEN coalesce((p_data->>'remove_key')::boolean,false) THEN NULL
                 WHEN coalesce(p_data->>'api_key','')='' THEN btb_ai_settings.api_key
                 ELSE excluded.api_key END,
    daily_limit=excluded.daily_limit,version=btb_ai_settings.version+1,updated_by=excluded.updated_by,updated_at=now()
  RETURNING * INTO saved;
  PERFORM btb_event(p_location,'ai_settings',p_location,'save',p_actor,to_jsonb(current)-'api_key',to_jsonb(saved)-'api_key');
  RETURN jsonb_build_object('location_id',saved.location_id,'enabled',saved.enabled,'model',saved.model,
    'has_key',saved.api_key IS NOT NULL,'api_key_masked',CASE WHEN saved.api_key IS NULL THEN '' ELSE repeat('*',8)||right(saved.api_key,4) END,
    'daily_limit',saved.daily_limit,'version',saved.version,'updated_at',saved.updated_at);
END $$;

-- Prepare one extraction: assert the document-kind capability, meter the use
-- against the location's daily cap, and only then hand the model + API key to
-- the server route. The raw key is returned exclusively to server code (the
-- route holds it in memory for the provider call) — the settings RPCs never
-- return it, and the browser only ever sees the masked tail.
CREATE OR REPLACE FUNCTION public.btb_ai_extract_prepare(p_actor uuid,p_session integer,p_location uuid,p_capability text,p_cost integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; v_used integer; v_limit integer; s btb_ai_settings;
BEGIN
  IF p_capability NOT IN ('inventory.write','purchase.upload') THEN RAISE EXCEPTION 'Invalid extraction capability'; END IF;
  IF coalesce(p_cost,1) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid usage cost'; END IF;
  actor:=btb_platform_assert(p_actor,p_session,p_location,p_capability);
  SELECT * INTO s FROM btb_ai_settings WHERE location_id=p_location;
  IF NOT FOUND OR s.enabled=false THEN
    RAISE EXCEPTION 'AI extraction is switched off for this location; enter the values by hand' USING ERRCODE='P0001';
  END IF;
  IF coalesce(s.api_key,'')='' THEN
    RAISE EXCEPTION 'AI extraction is not operational: no API key is configured for this location' USING ERRCODE='P0001';
  END IF;
  v_limit:=coalesce(s.daily_limit,25);
  IF p_cost>v_limit THEN RAISE EXCEPTION 'AI extraction daily limit reached for this location (% per day)',v_limit; END IF;
  INSERT INTO btb_ai_usage(location_id,day,used) VALUES(p_location,current_date,p_cost)
  ON CONFLICT(location_id,day) DO UPDATE SET used=btb_ai_usage.used+p_cost
  WHERE btb_ai_usage.used+p_cost<=v_limit
  RETURNING used INTO v_used;
  IF v_used IS NULL THEN RAISE EXCEPTION 'AI extraction daily limit reached for this location (% per day)',v_limit; END IF;
  RETURN jsonb_build_object('model',s.model,'api_key',s.api_key,'daily_limit',v_limit,'used',v_used);
END $$;

-- Meter one extraction attempt. The capability must match the document kind's
-- import gate ('inventory.write' for sales/master, 'purchase.upload' for GFS or
-- local receipts) so exactly the roles who may confirm can also extract.
-- Enforces the location's daily cap (default 25 when no explicit limit is
-- saved). Raises when the cap is reached; the caller decides the cost (a master
-- catalogue counts more than an invoice).
CREATE OR REPLACE FUNCTION public.btb_ai_consume(p_actor uuid,p_session integer,p_location uuid,p_capability text,p_cost integer)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; v_used integer; v_limit integer;
BEGIN
  IF p_capability NOT IN ('inventory.write','purchase.upload') THEN RAISE EXCEPTION 'Invalid extraction capability'; END IF;
  IF coalesce(p_cost,1) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid usage cost'; END IF;
  actor:=btb_platform_assert(p_actor,p_session,p_location,p_capability);
  v_limit:=coalesce((SELECT daily_limit FROM btb_ai_settings WHERE location_id=p_location),25);
  IF p_cost>v_limit THEN RAISE EXCEPTION 'AI extraction daily limit reached for this location (% per day)',v_limit; END IF;
  INSERT INTO btb_ai_usage(location_id,day,used) VALUES(p_location,current_date,p_cost)
  ON CONFLICT(location_id,day) DO UPDATE SET used=btb_ai_usage.used+p_cost
  WHERE btb_ai_usage.used+p_cost<=v_limit
  RETURNING used INTO v_used;
  IF v_used IS NULL THEN RAISE EXCEPTION 'AI extraction daily limit reached for this location (% per day)',v_limit; END IF;
  RETURN v_used;
END $$;

COMMIT;
