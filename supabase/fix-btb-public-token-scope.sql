-- PUB-01/PUB-02/PUB-03: apply after ALL historical public-policy releases.
-- A browser's anon key is not an identity. Require a short-lived, random
-- capability provisioned by the cookie-authenticated BTB server. Only its hash
-- is stored. Existing authenticated FoodSafe policies are not broadened.
BEGIN;

CREATE TABLE IF NOT EXISTS public.btb_public_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  restaurant_name text NOT NULL CHECK (length(restaurant_name) > 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.btb_public_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_public_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.btb_public_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.btb_public_restaurant()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE token text;
BEGIN
  BEGIN
    token := nullif(current_setting('request.headers', true), '')::jsonb->>'x-btb-public-token';
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  IF token IS NULL OR token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  RETURN (SELECT t.restaurant_name FROM public.btb_public_tokens t
    WHERE t.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
      AND t.expires_at > now() AND t.revoked_at IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.btb_public_restaurant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btb_public_restaurant() TO anon;

DO $$
DECLARE t text; predicate text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'compliance_documents','business_documents','staff_licenses',
    'inhouse_inspections','corporate_inspections','emergency_contacts',
    'operational_protocols','handbook_documents','handbook_signatures',
    'print_manuals','marketing_promotions','social_media_calendar',
    'new_restaurant_tasks','login_vault','prep_counts','order_sheets','cleaning_logs'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_btb_public', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_btb_token_allow', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_btb_token_boundary', t);
    IF t = 'handbook_signatures' THEN
      predicate := 'EXISTS (SELECT 1 FROM public.handbook_documents h WHERE h.id = handbook_id AND h.restaurant_name = public.btb_public_restaurant())';
    ELSIF t = 'login_vault' THEN
      -- Vault contents are server-only already; a public capability must never
      -- expose encrypted credentials or allow raw ciphertext replacement.
      predicate := 'false';
    ELSE
      predicate := 'restaurant_name = public.btb_public_restaurant()';
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon USING (%s) WITH CHECK (%s)', t || '_btb_token_allow', t, predicate, predicate);
    -- Restrictive AND boundary prevents a later permissive demo policy from
    -- reopening cross-restaurant access. Inserts/tenant changes are checked too.
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (%s) WITH CHECK (%s)', t || '_btb_token_boundary', t, predicate, predicate);
  END LOOP;
END;
$$;
COMMIT;
