-- ===========================================================================
-- STAGE A — PREFLIGHT & INSPECTION  (READ-ONLY)
-- Run this in Supabase Dashboard → SQL Editor BEFORE any other stage.
-- Safe: contains no DDL, no DML, no secrets, no customer data (counts only).
-- Expected results are documented in deploy/README.md.
-- ===========================================================================

-- A1. Existence of every object this deployment touches.
SELECT c.relname AS object,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'i' THEN 'index' WHEN 'S' THEN 'sequence' ELSE c.relkind::text END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'inventory_purchases','inventory_counts','inventory_items','inventory_month_summary',
    'inventory_month_snapshots','inventory_audit_log','role_page_access','_migrations'
  )
ORDER BY c.relname;

-- A2. Columns of the two tables Stage B will create (expect 0 rows if absent;
--     if rows exist, Stage B's compatibility guard re-checks them).
SELECT table_name, column_name, data_type, datetime_precision, numeric_precision, numeric_scale,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY table_name, ordinal_position;

-- A3. Columns of the already-applied inventory tables (compare against the
--     repository definitions in supabase/schema-month-end-inventory.sql,
--     schema-inventory-purchases.sql, schema-inventory-summary.sql).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
                     'inventory_month_summary','role_page_access')
ORDER BY table_name, ordinal_position;

-- A4. Constraints and indexes on the inventory surface.
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('inventory_purchases','inventory_counts','inventory_items',
                                   'inventory_month_summary','inventory_month_snapshots',
                                   'inventory_audit_log','role_page_access')
ORDER BY table_name, conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','inventory_month_snapshots',
                    'inventory_audit_log','role_page_access')
ORDER BY tablename, indexname;

-- A5. Row-Level Security status per table.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','inventory_month_snapshots',
                    'inventory_audit_log','role_page_access')
ORDER BY c.relname;

-- A6. Every policy on the inventory surface (expect permissive "USING (true)"
--     policies — this is the documented anon-access vulnerability, Stage C).
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','inventory_month_snapshots',
                    'inventory_audit_log','role_page_access')
ORDER BY tablename, policyname;

-- A7. Table-level grants to the PostgREST roles (RLS alone is not sufficient:
--     PostgREST needs the underlying GRANT too — Stage C removes both).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
                     'inventory_month_summary','inventory_month_snapshots',
                     'inventory_audit_log','role_page_access')
  AND grantee IN ('anon','authenticated','service_role')
ORDER BY table_name, grantee, privilege_type;

-- A8. Row COUNTS only — never selects rows themselves.
SELECT 'inventory_purchases' AS table_name, count(*) AS row_count FROM inventory_purchases
UNION ALL SELECT 'inventory_counts',       count(*) FROM inventory_counts
UNION ALL SELECT 'inventory_items',        count(*) FROM inventory_items
UNION ALL SELECT 'inventory_month_summary',count(*) FROM inventory_month_summary
UNION ALL SELECT 'role_page_access',       count(*) FROM role_page_access
ORDER BY 1;

-- Counts of the Stage B targets, reported via NOTICE so this still succeeds
-- when the tables are absent (their expected state today).
DO $$
DECLARE t TEXT; n BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_month_snapshots','inventory_audit_log'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'ROWCOUNT % : table absent (expected before Stage B)', t;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      RAISE NOTICE 'ROWCOUNT % : % rows', t, n;
    END IF;
  END LOOP;
END $$;

-- A9. Migration-ledger state (Stage D input). Wrapped so a missing table
--     reports NOTICE instead of aborting the script.
DO $$
BEGIN
  IF to_regclass('public._migrations') IS NULL THEN
    RAISE NOTICE 'LEDGER: public._migrations does NOT exist — the runner has never touched this database.';
  ELSE
    RAISE NOTICE 'LEDGER: public._migrations EXISTS with % rows — dump with: SELECT step, filename, checksum FROM _migrations ORDER BY step;', (SELECT count(*) FROM public._migrations);
  END IF;
END $$;

-- A10. End of Stage A. Nothing was changed.
SELECT 'STAGE A COMPLETE — read-only, nothing modified' AS result;
