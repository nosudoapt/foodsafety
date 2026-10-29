-- ===========================================================================
-- 01 — PREFLIGHT & INSPECTION  (READ-ONLY — safe to run at any time)
-- Supabase Dashboard → SQL Editor. No DDL, no DML, no secrets, no customer
-- rows (counts only). Expected results are in README.md.
-- ===========================================================================

-- 1.1 Existence of every object this deployment touches.
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
-- EXPECT: 5 table rows (the existing inventory tables + role_page_access).
--         NO rows for inventory_month_snapshots / inventory_audit_log / _migrations.

-- 1.2 Columns of the two tables the next script will create (expect 0 rows).
SELECT table_name, column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY table_name, ordinal_position;

-- 1.3 Columns of the existing tables (spot-check against the repo definitions:
--     inventory_purchases has 14 columns ending created_at/updated_at;
--     role_page_access is role/page/allowed).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
                     'inventory_month_summary','role_page_access')
ORDER BY table_name, ordinal_position;

-- 1.4 Constraints and indexes.
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('inventory_purchases','inventory_counts','inventory_items',
                                   'inventory_month_summary','role_page_access')
ORDER BY table_name, conname;
-- EXPECT: includes uniq_gfs_invoice (partial unique) and role_page_access_pkey.

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','role_page_access')
ORDER BY tablename, indexname;

-- 1.5 RLS status (expect relrowsecurity = true on all five).
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','role_page_access')
ORDER BY c.relname;

-- 1.6 Policies (expect one permissive *_public_all per table — the known
--     exposure that 04-security-hardening.sql will remove LATER).
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','role_page_access')
ORDER BY tablename, policyname;

-- 1.7 Grants to the PostgREST roles.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
                     'inventory_month_summary','role_page_access')
  AND grantee IN ('anon','authenticated','service_role')
ORDER BY table_name, grantee, privilege_type;

-- 1.8 Row COUNTS only (never the rows). role_page_access MUST show 67.
SELECT 'inventory_purchases' AS table_name, count(*) AS row_count FROM inventory_purchases
UNION ALL SELECT 'inventory_counts',       count(*) FROM inventory_counts
UNION ALL SELECT 'inventory_items',        count(*) FROM inventory_items
UNION ALL SELECT 'inventory_month_summary',count(*) FROM inventory_month_summary
UNION ALL SELECT 'role_page_access',       count(*) FROM role_page_access
ORDER BY 1;

-- 1.9 End — nothing was changed.
SELECT 'PREFLIGHT COMPLETE — read-only, nothing modified' AS result;
