-- BTB document/marketing uploader integration. Run in Supabase SQL Editor
-- AFTER schema-btb-team-operations.sql and alongside the new application.
-- Existing profiles FKs remain intact; employee attribution is separate.
BEGIN;

DO $$
DECLARE t text;
BEGIN
  IF to_regclass('public.btb_employees') IS NULL THEN
    RAISE EXCEPTION 'Install schema-btb-team-operations.sql first';
  END IF;
  FOREACH t IN ARRAY ARRAY['business_documents', 'marketing_promotions', 'social_media_calendar'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Missing required existing table: %', t;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS btb_created_by uuid REFERENCES public.btb_employees(id) ON DELETE SET NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS btb_created_by_name text', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_btb_public', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);

    -- FoodSafe continues using its authenticated policies. The former demo
    -- policy must not let a different FoodSafe restaurant access BTB rows.
    -- RESTRICTIVE also keeps this boundary if a legacy permissive policy exists.
    EXECUTE format('DROP POLICY IF EXISTS btb_workspace_boundary ON public.%I', t);
    EXECUTE format($policy$
      CREATE POLICY btb_workspace_boundary ON public.%I AS RESTRICTIVE
      FOR ALL TO authenticated
      USING (restaurant_name <> 'Between the Buns' OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.restaurant_name = 'Between the Buns'
      ))
      WITH CHECK (restaurant_name <> 'Between the Buns' OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.restaurant_name = 'Between the Buns'
      ))
    $policy$, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
