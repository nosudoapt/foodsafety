-- OFF-06: stable offline replay keys with atomic PostgreSQL receipts.
--
-- A capture is queued with its replay key BEFORE the first send, so a lost
-- HTTP response can be retried without double-writing evidence. The server
-- acknowledges only after commit; a replay of the same key returns the stored
-- receipt and performs no writes, so audit and receipt counts stay unchanged.
--
-- Receipt semantics, enforced inside one transaction:
--   • same key, same call  -> no-op, returns the originally stored result
--   • same key, different payload -> 22023 (mismatch, never silently applied)
--   • signed-in actor replaying another actor's receipt -> 42501
--   • mid-operation failure -> the whole transaction rolls back (e.g. a prep
--     sheet whose rows cannot all be inserted restores the deleted rows)
--
-- Legacy captures queued before replay keys existed are assigned one the first
-- time they drain (derived from their unique capture id) and persisted before
-- the first replay send, so retries stay idempotent. the unique temperature
-- index refuses duplicate keyed rows while legacy NULL rows remain untouched;
-- prep_counts shares one key per sheet, so its index is non-unique (forensic
-- use only).
BEGIN;

ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS replay_key text;
ALTER TABLE public.prep_counts ADD COLUMN IF NOT EXISTS replay_key text;
CREATE UNIQUE INDEX IF NOT EXISTS temperature_records_replay_key
  ON public.temperature_records(replay_key);
CREATE INDEX IF NOT EXISTS prep_counts_replay_key
  ON public.prep_counts(replay_key);

-- Server-only ledger of applied captures. No client role may read or write it;
-- only the SECURITY DEFINER replay functions below touch this table.
CREATE TABLE IF NOT EXISTS public.btb_offline_receipts (
  replay_key text PRIMARY KEY CHECK (replay_key ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('temp_record','prep_save')),
  actor uuid,
  args jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.btb_offline_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_offline_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Atomic, tenant-scoped receipt for a single offline temperature reading.
-- SECURITY DEFINER: the receipt ledger is only reachable through this function,
-- which re-validates everything it writes.
CREATE OR REPLACE FUNCTION public.btb_insert_temp_record(p_data jsonb, p_replay_key text)
RETURNS public.temperature_records LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user uuid;
  v_args jsonb;
  v_receipt public.btb_offline_receipts;
  v_saved public.temperature_records;
BEGIN
  IF p_replay_key IS NULL OR p_replay_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid replay key' USING ERRCODE='22023';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Invalid capture' USING ERRCODE='22023';
  END IF;
  -- Temperature evidence is bound to the signed-in reader: an anonymous or
  -- unverifiable caller must not impersonate someone else's capture. (The BTB
  -- prep tablet is the one shared-tablet surface, and prep is a public page.)
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to record temperatures' USING ERRCODE='42501'; END IF;
  v_user := (p_data->>'user_id')::uuid;                     -- 22P02/22023 on garbage
  IF v_user IS NULL THEN RAISE EXCEPTION 'A reader is required' USING ERRCODE='22023'; END IF;
  IF v_user IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Captures are bound to their author' USING ERRCODE='42501';
  END IF;
  IF p_data->>'equipment_name' IS NULL OR length(trim(p_data->>'equipment_name')) NOT BETWEEN 1 AND 250
     OR p_data->>'food_item' IS NULL OR length(trim(p_data->>'food_item')) NOT BETWEEN 1 AND 250
     OR p_data->>'restaurant_name' IS NULL OR length(trim(p_data->>'restaurant_name')) NOT BETWEEN 1 AND 250
     OR p_data->>'record_type' NOT IN ('cooking','cooling','cold_storage','hot_holding','reheating','probe_calibration') THEN
    RAISE EXCEPTION 'Invalid capture' USING ERRCODE='22023';
  END IF;
  v_args := jsonb_build_object(
    'user_id', v_user,
    'restaurant_name', trim(p_data->>'restaurant_name'),
    'location_id', nullif(p_data->>'location_id',''),
    'equipment_name', trim(p_data->>'equipment_name'),
    'record_type', p_data->>'record_type',
    'food_item', trim(p_data->>'food_item'),
    'temperature', (p_data->>'temperature')::numeric,
    'unit', coalesce(p_data->>'unit','C'),
    'min_safe_temp', (p_data->>'min_safe_temp')::numeric,
    'max_safe_temp', (p_data->>'max_safe_temp')::numeric,
    'is_safe', (p_data->>'is_safe')::boolean,
    'notes', coalesce(p_data->>'notes',''),
    'recorded_at', coalesce(p_data->>'recorded_at','')
  );

  PERFORM pg_advisory_xact_lock(hashtextextended('btb-offline:'||p_replay_key, 0));
  SELECT * INTO v_receipt FROM public.btb_offline_receipts WHERE replay_key = p_replay_key;
  IF FOUND THEN
    IF v_receipt.kind <> 'temp_record' OR v_receipt.args IS DISTINCT FROM v_args THEN
      RAISE EXCEPTION 'Replay key does not match this capture' USING ERRCODE='22023';
    END IF;
    IF v_receipt.actor IS NULL THEN
      NULL; -- Service/tablet capture: it carries no personal identity to protect.
    ELSIF v_uid IS NULL OR v_receipt.actor <> v_uid THEN
      RAISE EXCEPTION 'This capture belongs to another user' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_populate_record(NULL::public.temperature_records, v_receipt.result);
  END IF;

  INSERT INTO public.temperature_records(user_id,restaurant_name,location_id,equipment_name,record_type,food_item,
    temperature,unit,min_safe_temp,max_safe_temp,is_safe,notes,recorded_at,replay_key)
  VALUES(v_user, trim(p_data->>'restaurant_name'), nullif(p_data->>'location_id','')::uuid, trim(p_data->>'equipment_name'),
    p_data->>'record_type', trim(p_data->>'food_item'), (p_data->>'temperature')::numeric,
    coalesce(p_data->>'unit','C'), (p_data->>'min_safe_temp')::numeric, (p_data->>'max_safe_temp')::numeric,
    (p_data->>'is_safe')::boolean, coalesce(p_data->>'notes',''), (p_data->>'recorded_at')::timestamptz, p_replay_key)
  ON CONFLICT (replay_key) DO NOTHING
  RETURNING * INTO v_saved;

  IF NOT FOUND THEN
    -- A keyed row already exists without a receipt (interrupted pre-fix save).
    -- Treat it as this capture's acknowledgement instead of writing twice.
    SELECT * INTO v_saved FROM public.temperature_records WHERE replay_key = p_replay_key;
    INSERT INTO public.btb_offline_receipts(replay_key,kind,actor,args,result) VALUES (p_replay_key,'temp_record',v_uid,v_args,to_jsonb(v_saved));
    RETURN v_saved;
  END IF;

  INSERT INTO public.btb_offline_receipts(replay_key,kind,actor,args,result)
  VALUES (p_replay_key,'temp_record',v_uid,v_args,to_jsonb(v_saved));
  RETURN v_saved;
END $$;
REVOKE ALL ON FUNCTION public.btb_insert_temp_record(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_insert_temp_record(jsonb,text) TO authenticated,service_role;

-- Atomic, tenant-scoped receipt for a whole offline prep sheet save.
-- Same delete-then-insert contract the foreground page uses, in one
-- transaction, with the capture's key gating replays. A replay performs no
-- delete and no insert, leaving every row and prior count untouched.
CREATE OR REPLACE FUNCTION public.btb_replay_prep_save(p_date date, p_scope text, p_rows jsonb, p_replay_key text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_args jsonb;
  v_receipt public.btb_offline_receipts;
  v_eqs text[];
  v_has_null boolean;
  v_token jsonb;
  v_affected bigint;
BEGIN
  IF p_replay_key IS NULL OR p_replay_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid replay key' USING ERRCODE='22023';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'A count date is required' USING ERRCODE='22023'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Invalid prep rows' USING ERRCODE='22023';
  END IF;
  FOR v_token IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
    IF jsonb_typeof(v_token) <> 'object'
       OR v_token->>'item_name' IS NULL OR length(trim(v_token->>'item_name')) NOT BETWEEN 1 AND 250 THEN
      RAISE EXCEPTION 'Invalid prep row' USING ERRCODE='22023';
    END IF;
    IF (v_token->>'par')::numeric IS NULL OR (v_token->>'par')::numeric < 0 OR (v_token->>'par')::numeric >= 1000000
       OR (v_token->>'on_hand')::numeric IS NULL OR (v_token->>'on_hand')::numeric < 0 OR (v_token->>'on_hand')::numeric >= 1000000
       OR (v_token->>'pull')::numeric IS NULL OR (v_token->>'pull')::numeric < 0 OR (v_token->>'pull')::numeric >= 1000000
       OR (v_token->>'urgent')::boolean IS NULL THEN
      RAISE EXCEPTION 'Invalid prep row' USING ERRCODE='22023';
    END IF;
  END LOOP;

  v_eqs := NULL; v_has_null := false;
  IF p_scope IS NOT NULL THEN
    IF length(p_scope) > 512 THEN RAISE EXCEPTION 'Invalid location scope' USING ERRCODE='22023'; END IF;
    SELECT array_agg(m[1]) INTO v_eqs
      FROM unnest(string_to_array(p_scope, ',')) AS token(t),
           regexp_matches(trim(t), '^location_id\.eq\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$') AS m;
    v_has_null := 'location_id.is.null' = ANY (string_to_array(regexp_replace(p_scope, '\s', '', 'g'), ','));
    IF NOT v_has_null AND coalesce(cardinality(v_eqs), 0) = 0 THEN
      RAISE EXCEPTION 'Invalid location scope' USING ERRCODE='22023';
    END IF;
  END IF;

  v_args := jsonb_build_object('p_date', p_date, 'p_scope', p_scope, 'p_rows', p_rows);

  PERFORM pg_advisory_xact_lock(hashtextextended('btb-offline:'||p_replay_key, 0));
  SELECT * INTO v_receipt FROM public.btb_offline_receipts WHERE replay_key = p_replay_key;
  IF FOUND THEN
    IF v_receipt.kind <> 'prep_save' OR v_receipt.args IS DISTINCT FROM v_args THEN
      RAISE EXCEPTION 'Replay key does not match this capture' USING ERRCODE='22023';
    END IF;
    IF v_receipt.actor IS NULL THEN
      NULL; -- Shared-tablet capture with no personal identity to protect.
    ELSIF v_uid IS NULL OR v_receipt.actor <> v_uid THEN
      RAISE EXCEPTION 'This capture belongs to another user' USING ERRCODE='42501';
    END IF;
    RETURN (v_receipt.result->>'affected')::bigint;
  END IF;

  DELETE FROM public.prep_counts
  WHERE restaurant_name='Between the Buns' AND count_date=p_date
    AND (p_scope IS NULL
      OR (v_has_null AND location_id IS NULL)
      OR (v_eqs IS NOT NULL AND cardinality(v_eqs) > 0 AND location_id::text = ANY(v_eqs)));

  INSERT INTO public.prep_counts(restaurant_name,item_name,par,on_hand,pull,urgent,count_date,location_id,replay_key)
  SELECT 'Between the Buns', trim(r->>'item_name'), (r->>'par')::numeric, (r->>'on_hand')::numeric, (r->>'pull')::numeric,
    (r->>'urgent')::boolean, p_date, nullif(r->>'location_id','')::uuid, p_replay_key
  FROM jsonb_array_elements(p_rows) r;
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  INSERT INTO public.btb_offline_receipts(replay_key,kind,actor,args,result)
  VALUES (p_replay_key,'prep_save',v_uid,v_args,jsonb_build_object('affected', v_affected));
  RETURN v_affected;
END $$;
REVOKE ALL ON FUNCTION public.btb_replay_prep_save(date,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_replay_prep_save(date,text,jsonb,text) TO anon,authenticated,service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
