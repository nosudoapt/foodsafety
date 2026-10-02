-- Between the Buns public access — demo-grade RLS.
--
-- BTB is a cookie-authed surface (shared store tablets) with NO Supabase auth
-- session. To let every BTB role read/write the compliance & admin features
-- (compliance, documents, staff licenses, inspections, emergency contacts,
-- protocols, handbook, manuals, marketing, new-restaurant, login vault) we add
-- a single permissive "public" policy per table — the same pattern
-- schema-features.sql already uses for prep_counts / order_sheets / cleaning_logs.
--
-- WARNING: this removes per-row / per-user security on these tables. It is
-- acceptable for the single-tenant BTB demo (one restaurant group, shared
-- tablets) and is NOT production row security. Revisit with a restaurant_id
-- claim before any multi-tenant use. Idempotent: safe to re-run.
--
-- Run order: after all other schema files (it only touches existing tables).
-- The vault stays encrypted at rest regardless (see src/lib/vault-crypto.ts);
-- this only governs table-level access, not the ciphertext.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'compliance_documents',
    'business_documents',
    'staff_licenses',
    'inhouse_inspections',
    'corporate_inspections',
    'emergency_contacts',
    'operational_protocols',
    'handbook_documents',
    'handbook_signatures',
    'print_manuals',
    'marketing_promotions',
    'social_media_calendar',
    'new_restaurant_tasks',
    'login_vault'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only touch tables that actually exist in this database.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS "%s_btb_public" ON %I;', t, t);
      EXECUTE format(
        'CREATE POLICY "%s_btb_public" ON %I FOR ALL USING (true) WITH CHECK (true);',
        t, t
      );
    END IF;
  END LOOP;
END $$;
