-- ===========================================================================
-- 03 — POST-DEPLOYMENT VERIFICATION  (READ-ONLY)
-- Run after 02. Checks the two new tables, preserved data, and the
-- migration-equivalence evidence needed before any ledger baseline.
-- Every query below is expected to SUCCEED; expected results are inline.
-- ===========================================================================

-- 3.1 Both new tables exist (expect exactly 2 rows).
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY 1;

-- 3.2 Snapshots columns match the repository definition (expect 15 rows;
--     count_month text PK, status has the ('finalized','draft') CHECK,
--     version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL).
SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='inventory_month_snapshots'
ORDER BY ordinal_position;

-- 3.3 Audit columns match (expect 8 rows; id bigint PK with a sequence
--     default; count_month/action NOT NULL).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='inventory_audit_log'
ORDER BY ordinal_position;

-- 3.4 Primary keys + the status CHECK (expect 2 PKs + 1 CHECK).
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE connamespace='public'::regnamespace
  AND conrelid::regclass::text IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY 1,2;

-- 3.5 Audit index exists (expect inventory_audit_log_pkey + idx_inv_audit_month).
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='inventory_audit_log';

-- 3.6 RLS enabled on both (expect true/true) and both policies present.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY 1;

SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY 1,2;

-- 3.7 EXISTING DATA UNTOUCHED — row counts identical to preflight 1.8.
--     role_page_access MUST still be 67.
SELECT 'inventory_purchases' AS table_name, count(*) AS row_count FROM inventory_purchases
UNION ALL SELECT 'inventory_counts',       count(*) FROM inventory_counts
UNION ALL SELECT 'inventory_items',        count(*) FROM inventory_items
UNION ALL SELECT 'inventory_month_summary',count(*) FROM inventory_month_summary
UNION ALL SELECT 'role_page_access',       count(*) FROM role_page_access
ORDER BY 1;

-- 3.8 New tables are empty (expect 0, 0 — no probe/demo data).
SELECT 'inventory_month_snapshots' AS table_name, count(*) AS row_count FROM inventory_month_snapshots
UNION ALL SELECT 'inventory_audit_log', count(*) FROM inventory_audit_log;

-- ===========================================================================
-- 3.9 LEDGER-EQUIVALENCE EVIDENCE (needed BEFORE `--baseline 27`).
--     Every step 1–22 base table must exist. Expect 0 rows below.
-- ===========================================================================
SELECT t AS missing_step_1_22_table
FROM unnest(ARRAY['profiles','equipment','temperature_records','daily_checks',
 'cleaning_records','allergen_records','delivery_records','corrective_actions',
 'pest_control','training_records','business_documents','staff_licenses',
 'marketing_promotions','inhouse_inspections','corporate_inspections',
 'print_manuals','social_media_calendar','prep_counts','order_sheets',
 'cleaning_logs','compliance_documents','login_vault','emergency_contacts',
 'handbook_documents','handbook_signatures','operational_protocols',
 'new_restaurant_tasks','locations','location_members','cash_outs',
 'staff_members','staff_shifts','corporate_dates','training_topics',
 'training_sections','branding_requests']) AS t
WHERE to_regclass('public.' || t) IS NULL;

-- 3.10 Step 24 equivalence: inventory_purchases shape (expect the partial
--      unique index and the 13-column table).
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='inventory_purchases'
ORDER BY 1;
-- EXPECT: inventory_purchases_pkey, idx_inv_purch_month, idx_inv_purch_date,
--         uniq_gfs_invoice.

-- 3.11 Step 27 equivalence: role_page_access shape (expect PK on (role,page),
--      67 rows, policy rpa_public_all).
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.role_page_access'::regclass;
-- EXPECT: role_page_access_pkey PRIMARY KEY (role, page).

-- 3.12 Ledger state (Stage D input). Wrapped so a missing table is a NOTICE.
DO $$
BEGIN
  IF to_regclass('public._migrations') IS NULL THEN
    RAISE NOTICE 'LEDGER: public._migrations does NOT exist — the runner has never touched this database.';
  ELSE
    RAISE NOTICE 'LEDGER: public._migrations EXISTS with % rows.', (SELECT count(*) FROM public._migrations);
  END IF;
END $$;

SELECT '03 VERIFICATION COMPLETE' AS result;
