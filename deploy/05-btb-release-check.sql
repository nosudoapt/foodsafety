-- Read-only, one-grid BTB release verification for Supabase SQL Editor.
-- Run after schema-btb-team-operations.sql and schema-btb-uploads.sql.
-- It is also safe before installation: missing release objects report FAIL.
WITH expected_tables(name, server_only) AS (
  VALUES
    ('btb_employees', true), ('btb_employee_credentials', true), ('btb_login_limits', true),
    ('btb_shifts', true), ('btb_shift_checks', true), ('btb_check_revisions', true),
    ('btb_order_sheets', true), ('btb_order_revisions', true),
    ('training_topics', true), ('training_sections', true),
    ('btb_training_records', true), ('btb_training_reviews', true),
    ('btb_franchise_tasks', true), ('btb_staff_licences', true),
    ('btb_notification_settings', true), ('btb_licence_email_log', true),
    ('business_documents', false), ('marketing_promotions', false), ('social_media_calendar', false)
), relations AS (
  SELECT e.*, c.oid, c.relrowsecurity
  FROM expected_tables e
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.name)
), expected_functions(name) AS (
  VALUES ('btb_consume_login_attempt'), ('btb_save_employee'), ('btb_save_shift'),
    ('btb_save_shift_check'), ('btb_save_order'), ('btb_save_training_topic'),
    ('btb_save_training_record'), ('btb_review_training'), ('btb_claim_licence_email')
), functions AS (
  SELECT e.name, p.oid
  FROM expected_functions e
  LEFT JOIN pg_proc p ON p.proname = e.name AND p.pronamespace = 'public'::regnamespace
), uploader AS (
  SELECT u.id, p.restaurant_name, p.role, u.banned_until
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email = 'btb-uploader@foodsafe.invalid'
    AND u.raw_app_meta_data ->> 'btb_uploader' = 'true'
), expected_fks(table_name, column_name, target) AS (
  VALUES ('business_documents', 'user_id', 'profiles'),
    ('business_documents', 'uploaded_by', 'profiles'),
    ('marketing_promotions', 'user_id', 'profiles'),
    ('social_media_calendar', 'user_id', 'profiles'),
    ('business_documents', 'btb_created_by', 'btb_employees'),
    ('marketing_promotions', 'btb_created_by', 'btb_employees'),
    ('social_media_calendar', 'btb_created_by', 'btb_employees')
), checks AS (
  SELECT '1. Tables and grants' AS section, name AS item,
    CASE WHEN oid IS NOT NULL AND relrowsecurity
      AND NOT has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE')
      AND (NOT server_only OR NOT has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE'))
      AND has_table_privilege('service_role', oid, 'SELECT')
      AND has_table_privilege('service_role', oid, 'INSERT')
      AND has_table_privilege('service_role', oid, 'UPDATE')
      AND has_table_privilege('service_role', oid, 'DELETE')
      AND (server_only OR (
        has_table_privilege('authenticated', oid, 'SELECT')
        AND has_table_privilege('authenticated', oid, 'INSERT')
        AND has_table_privilege('authenticated', oid, 'UPDATE')
        AND has_table_privilege('authenticated', oid, 'DELETE')
      ))
      THEN 'PASS' ELSE 'FAIL' END AS result,
    CASE WHEN oid IS NULL THEN 'Missing table: install the release SQL.'
      WHEN server_only THEN 'Expected: RLS enabled; server CRUD; no anon/authenticated table access.'
      ELSE 'Expected: RLS enabled; server and FoodSafe authenticated CRUD; no anon access.' END AS detail
  FROM relations
  UNION ALL
  SELECT '2. Server functions', name,
    CASE WHEN oid IS NOT NULL AND has_function_privilege('service_role', oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
      THEN 'PASS' ELSE 'FAIL' END,
    'Expected: function exists and only the server role can execute it.'
  FROM functions
  UNION ALL
  SELECT '3. Upload boundary', name,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = r.oid AND p.polname = 'btb_workspace_boundary' AND NOT p.polpermissive
        AND p.polcmd = '*' AND 'authenticated'::regrole::oid = ANY(p.polroles)
        AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
    )
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = r.oid AND p.polname = r.name || '_btb_public')
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = r.oid AND a.attname = 'btb_created_by_name' AND NOT a.attisdropped)
      THEN 'PASS' ELSE 'FAIL' END,
    'Expected: restrictive BTB restaurant boundary, creator attribution and removed legacy public policy.'
  FROM relations r WHERE NOT server_only
  UNION ALL
  SELECT '4. Foreign keys', f.table_name || '.' || f.column_name,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND c.conkey = ARRAY[a.attnum] AND NOT a.attisdropped
      JOIN pg_attribute target ON target.attrelid = c.confrelid AND c.confkey = ARRAY[target.attnum] AND NOT target.attisdropped
      WHERE c.contype = 'f' AND c.convalidated AND target.attname = 'id'
        AND c.conrelid = to_regclass('public.' || f.table_name)
        AND a.attname = f.column_name AND c.confrelid = to_regclass('public.' || f.target)
    ) THEN 'PASS' ELSE 'FAIL' END,
    'Expected foreign key to public.' || f.target || '.id.'
  FROM expected_fks f
  UNION ALL
  SELECT '5. Uploader identity', 'BTB_UPLOADER_PROFILE_ID',
    CASE WHEN count(*) = 1 AND bool_and(restaurant_name = 'Between the Buns' AND role = 'staff' AND banned_until > now())
      THEN 'PASS' ELSE 'FAIL' END,
    coalesce(string_agg(id::text, ', '), 'Run scripts/provision-btb-uploader.mjs using the existing service-role configuration.')
  FROM uploader
)
SELECT section, item, result, detail FROM checks ORDER BY section, item;
