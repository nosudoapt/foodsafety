-- ============================================================================
-- 01b — COMPACT PRODUCTION PREFLIGHT (READ-ONLY)
--
-- One query, one compact result grid. It does not create or alter anything,
-- does not execute a migration, and does not create/read migration-ledger rows.
-- It uses only PostgreSQL system catalogs and SELECTs; no optional extension
-- functions are called. Row data is never returned — only five row counts.
--
-- STATUS MEANING
--   PASS   safely verified by this query
--   FAIL   a concrete missing/incompatible object or known security exposure
--   REVIEW cannot be proven safely from catalogs alone (never assumed PASS)
-- ============================================================================

WITH
-- Final table/column inventory derived from the actual files listed in
-- supabase/migrations.json (steps 1–27), including later ALTER ... ADD COLUMN
-- statements. Steps 25/26 are handled separately because they are expected to
-- be absent before deploy/02-create-missing-tables.sql.
expected_table_columns(step_no, table_name, column_names) AS (VALUES
  (1, 'profiles', ARRAY['id','email','full_name','restaurant_name','role','created_at','updated_at','trial_ends_at','location_id']::text[]),
  (1, 'equipment', ARRAY['id','user_id','restaurant_name','name','type','min_safe_temp','max_safe_temp','location','created_at']::text[]),
  (1, 'temperature_records', ARRAY['id','user_id','restaurant_name','equipment_name','record_type','food_item','temperature','unit','min_safe_temp','max_safe_temp','is_safe','notes','recorded_at','created_at','location_id']::text[]),
  (1, 'daily_checks', ARRAY['id','user_id','restaurant_name','check_type','checklist_items','completed','completed_at','notes','created_at']::text[]),
  (1, 'cleaning_records', ARRAY['id','user_id','restaurant_name','task_name','area','frequency','completed','completed_at','notes','created_at']::text[]),
  (1, 'allergen_records', ARRAY['id','user_id','restaurant_name','menu_item','allergens','notes','created_at','updated_at']::text[]),
  (1, 'delivery_records', ARRAY['id','user_id','restaurant_name','supplier_name','delivery_date','items','temperature','is_accepted','rejection_reason','notes','created_at']::text[]),
  (1, 'corrective_actions', ARRAY['id','user_id','restaurant_name','issue_description','severity','action_taken','resolved','resolved_at','notes','created_at','location_id']::text[]),
  (1, 'pest_control', ARRAY['id','user_id','restaurant_name','inspection_date','findings','action_taken','next_inspection_date','notes','created_at']::text[]),
  (1, 'training_records', ARRAY['id','user_id','restaurant_name','staff_name','training_topic','training_date','expiry_date','certificate_url','notes','created_at']::text[]),
  (2, 'business_documents', ARRAY['id','user_id','restaurant_name','doc_type','file_name','file_url','file_size','uploaded_by','expiry_date','notes','created_at','updated_at','name']::text[]),
  (2, 'staff_licenses', ARRAY['id','user_id','restaurant_name','staff_name','license_type','file_name','file_url','issue_date','expiry_date','notes','created_at','file_size']::text[]),
  (2, 'marketing_promotions', ARRAY['id','user_id','restaurant_name','title','description','file_name','file_url','month','year','status','created_at','updated_at','file_size','category','size','person_name','location_id']::text[]),
  (2, 'inhouse_inspections', ARRAY['id','user_id','restaurant_name','inspection_date','inspector_name','sections','overall_score','max_score','notes','created_at']::text[]),
  (2, 'corporate_inspections', ARRAY['id','user_id','restaurant_name','inspection_date','inspector_name','inspector_role','sections','overall_score','max_score','rating','strengths','improvements','action_items','signed_off','signed_off_at','notes','created_at','inspection_type']::text[]),
  (2, 'print_manuals', ARRAY['id','user_id','restaurant_name','title','description','file_name','file_url','category','created_at','file_size']::text[]),
  (2, 'social_media_calendar', ARRAY['id','user_id','restaurant_name','day','channel','caption','post_date','created_at']::text[]),
  (4, 'prep_counts', ARRAY['id','restaurant_name','item_name','par','on_hand','count_date','created_at','location_id','urgent','pull']::text[]),
  (4, 'order_sheets', ARRAY['id','restaurant_name','item_name','par','on_hand','order_date','created_at','location_id','urgent']::text[]),
  (4, 'cleaning_logs', ARRAY['id','restaurant_name','task_name','done_by','before_photo','after_photo','done_date','created_at','done_time','week_start','location_id']::text[]),
  (5, 'compliance_documents', ARRAY['id','restaurant_name','doc_type','name','file_name','file_url','issue_date','expiry_date','notes','uploaded_by','created_at','location_id']::text[]),
  (5, 'login_vault', ARRAY['id','restaurant_name','service','category','username','secret','url','notes','created_at']::text[]),
  (5, 'emergency_contacts', ARRAY['id','restaurant_name','name','role','phone','kind','rank','notes','created_at','category','phone_2','phone_3','contact_name','email']::text[]),
  (5, 'handbook_documents', ARRAY['id','restaurant_name','title','version','file_url','body','created_at']::text[]),
  (5, 'handbook_signatures', ARRAY['id','handbook_id','staff_name','signature','signed_at']::text[]),
  (5, 'operational_protocols', ARRAY['id','restaurant_name','title','icon','steps','sort_order','created_at']::text[]),
  (5, 'new_restaurant_tasks', ARRAY['id','restaurant_name','phase','task','done','sort_order','created_at']::text[]),
  (11, 'locations', ARRAY['id','name','address','created_at']::text[]),
  (11, 'location_members', ARRAY['location_id','user_id','created_at']::text[]),
  (16, 'cash_outs', ARRAY['id','location_id','count_date','till_amount','cash_sale','delivery_fees','driver_tips','cash_out','safe_drop','created_by','created_at']::text[]),
  (17, 'staff_members', ARRAY['id','location_id','name','phone','email','position','created_at']::text[]),
  (17, 'staff_shifts', ARRAY['id','staff_member_id','location_id','shift_date','start_time','end_time','created_at']::text[]),
  (18, 'corporate_dates', ARRAY['id','location_id','title','category','due_date','recurrence','notes','created_by','created_at']::text[]),
  (19, 'training_topics', ARRAY['id','location_id','title','category','est_minutes','published','position','created_by','created_at']::text[]),
  (19, 'training_sections', ARRAY['id','topic_id','position','heading','body','created_at']::text[]),
  (20, 'inventory_items', ARRAY['id','location_id','name','unit','category','unit_cost','position','created_at']::text[]),
  (20, 'inventory_counts', ARRAY['id','location_id','item_id','count_month','qty','counted_by','created_at']::text[]),
  (21, 'branding_requests', ARRAY['id','location_id','title','category','description','priority','status','requested_by','due_date','updated_at','created_at']::text[]),
  (24, 'inventory_purchases', ARRAY['id','count_month','purchase_date','type','supplier','description','amount','reference','notes','cash_out_id','counted_by','created_at','updated_at']::text[]),
  (25, 'inventory_month_snapshots', ARRAY['count_month','opening_value','closing_value','purchases','sales','cogs','food_cost_pct','status','finalized_by','finalized_at','reopened_by','reopened_at','reopen_reason','version','created_at']::text[]),
  (26, 'inventory_audit_log', ARRAY['id','count_month','action','actor','reason','snapshot','version','created_at']::text[]),
  (27, 'role_page_access', ARRAY['role','page','allowed']::text[])
),
expected_columns AS (
  SELECT e.step_no, e.table_name, u.column_name
  FROM expected_table_columns e
  CROSS JOIN LATERAL unnest(e.column_names) AS u(column_name)
),
actual_public_tables AS (
  SELECT c.oid, c.relname AS table_name, c.relrowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
),
missing_core_tables AS (
  SELECT e.step_no, e.table_name
  FROM expected_table_columns e
  LEFT JOIN actual_public_tables a USING (table_name)
  WHERE e.step_no NOT IN (25,26) AND a.oid IS NULL
),
missing_core_columns AS (
  SELECT e.step_no, e.table_name, e.column_name
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
  WHERE e.step_no NOT IN (25,26) AND c.column_name IS NULL
),

-- Explicit indexes declared by the migration files. PK/UNIQUE constraint
-- backing indexes are checked separately below.
expected_indexes(step_no, table_name, index_name) AS (VALUES
  (1, 'temperature_records', 'idx_temperature_records_user_id'),
  (1, 'temperature_records', 'idx_temperature_records_recorded_at'),
  (1, 'temperature_records', 'idx_temperature_records_record_type'),
  (1, 'daily_checks', 'idx_daily_checks_user_id'),
  (1, 'daily_checks', 'idx_daily_checks_created_at'),
  (1, 'cleaning_records', 'idx_cleaning_records_user_id'),
  (1, 'allergen_records', 'idx_allergen_records_user_id'),
  (1, 'delivery_records', 'idx_delivery_records_user_id'),
  (1, 'corrective_actions', 'idx_corrective_actions_user_id'),
  (1, 'pest_control', 'idx_pest_control_user_id'),
  (1, 'training_records', 'idx_training_records_user_id'),
  (2, 'social_media_calendar', 'idx_social_media_calendar_user_id'),
  (2, 'business_documents', 'idx_business_documents_user_id'),
  (2, 'business_documents', 'idx_business_documents_doc_type'),
  (2, 'staff_licenses', 'idx_staff_licenses_user_id'),
  (2, 'marketing_promotions', 'idx_marketing_promotions_user_id'),
  (2, 'inhouse_inspections', 'idx_inhouse_inspections_user_id'),
  (2, 'corporate_inspections', 'idx_corporate_inspections_user_id'),
  (2, 'print_manuals', 'idx_print_manuals_user_id'),
  (4, 'prep_counts', 'idx_prep_counts_date'),
  (4, 'order_sheets', 'idx_order_sheets_date'),
  (4, 'cleaning_logs', 'idx_cleaning_logs_date'),
  (5, 'compliance_documents', 'idx_compliance_expiry'),
  (5, 'emergency_contacts', 'idx_emergency_rank'),
  (9, 'cleaning_logs', 'idx_cleaning_logs_week'),
  (10, 'emergency_contacts', 'idx_emergency_category'),
  (11, 'profiles', 'idx_profiles_location'),
  (11, 'prep_counts', 'idx_prep_counts_location'),
  (11, 'order_sheets', 'idx_order_sheets_location'),
  (11, 'cleaning_logs', 'idx_cleaning_logs_location'),
  (11, 'compliance_documents', 'idx_compliance_docs_location'),
  (11, 'temperature_records', 'idx_temperature_location'),
  (11, 'corrective_actions', 'idx_corrective_actions_location'),
  (12, 'corporate_inspections', 'idx_corporate_inspections_type'),
  (16, 'cash_outs', 'idx_cash_outs_date'),
  (16, 'cash_outs', 'idx_cash_outs_location'),
  (17, 'staff_members', 'idx_staff_members_location'),
  (17, 'staff_shifts', 'idx_staff_shifts_location'),
  (17, 'staff_shifts', 'idx_staff_shifts_date'),
  (17, 'staff_shifts', 'idx_staff_shifts_member'),
  (18, 'corporate_dates', 'idx_corporate_dates_location'),
  (18, 'corporate_dates', 'idx_corporate_dates_due'),
  (19, 'training_topics', 'idx_training_topics_location'),
  (19, 'training_sections', 'idx_training_sections_topic'),
  (20, 'inventory_items', 'idx_inventory_items_location'),
  (20, 'inventory_counts', 'idx_inventory_counts_month'),
  (20, 'inventory_counts', 'idx_inventory_counts_item'),
  (21, 'branding_requests', 'idx_branding_requests_location'),
  (21, 'branding_requests', 'idx_branding_requests_status'),
  (21, 'branding_requests', 'idx_branding_requests_created'),
  (24, 'inventory_purchases', 'idx_inv_purch_month'),
  (24, 'inventory_purchases', 'idx_inv_purch_date'),
  (24, 'inventory_purchases', 'uniq_gfs_invoice'),
  (26, 'inventory_audit_log', 'idx_inv_audit_month')
),
missing_core_indexes AS (
  SELECT e.*
  FROM expected_indexes e
  LEFT JOIN pg_catalog.pg_indexes i
    ON i.schemaname = 'public'
   AND i.tablename = e.table_name
   AND i.indexname = e.index_name
  WHERE e.step_no NOT IN (25,26) AND i.indexname IS NULL
),

-- Constraint helpers: ordered constrained-column arrays make composite PK,
-- UNIQUE and FK checks deterministic without relying on generated names.
constraint_columns AS (
  SELECT con.oid AS constraint_oid,
         n.nspname AS table_schema,
         rel.relname AS table_name,
         con.contype,
         array_agg(att.attname ORDER BY key.ord)::name[] AS columns,
         pg_catalog.pg_get_constraintdef(con.oid) AS definition
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
  CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key(attnum, ord)
  JOIN pg_catalog.pg_attribute att
    ON att.attrelid = rel.oid AND att.attnum = key.attnum
  GROUP BY con.oid, n.nspname, rel.relname, con.contype
),
missing_core_primary_keys AS (
  SELECT e.table_name
  FROM expected_table_columns e
  WHERE e.step_no NOT IN (25,26)
    AND NOT EXISTS (
      SELECT 1 FROM constraint_columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.contype = 'p'
    )
),

-- Every single-column FK declared by steps 1–24. Delete action codes are
-- PostgreSQL catalog values: a=no action, c=cascade, n=set null.
expected_foreign_keys(table_name, column_name, ref_schema, ref_table, ref_column, delete_action) AS (VALUES
  ('profiles','id','auth','users','id','c'),
  ('equipment','user_id','public','profiles','id','c'),
  ('temperature_records','user_id','public','profiles','id','c'),
  ('daily_checks','user_id','public','profiles','id','c'),
  ('cleaning_records','user_id','public','profiles','id','c'),
  ('allergen_records','user_id','public','profiles','id','c'),
  ('delivery_records','user_id','public','profiles','id','c'),
  ('corrective_actions','user_id','public','profiles','id','c'),
  ('pest_control','user_id','public','profiles','id','c'),
  ('training_records','user_id','public','profiles','id','c'),
  ('business_documents','user_id','public','profiles','id','c'),
  ('business_documents','uploaded_by','public','profiles','id','a'),
  ('staff_licenses','user_id','public','profiles','id','c'),
  ('marketing_promotions','user_id','public','profiles','id','c'),
  ('inhouse_inspections','user_id','public','profiles','id','c'),
  ('corporate_inspections','user_id','public','profiles','id','c'),
  ('print_manuals','user_id','public','profiles','id','c'),
  ('social_media_calendar','user_id','public','profiles','id','c'),
  ('compliance_documents','uploaded_by','public','profiles','id','a'),
  ('handbook_signatures','handbook_id','public','handbook_documents','id','c'),
  ('profiles','location_id','public','locations','id','n'),
  ('location_members','location_id','public','locations','id','c'),
  ('location_members','user_id','public','profiles','id','c'),
  ('prep_counts','location_id','public','locations','id','n'),
  ('order_sheets','location_id','public','locations','id','n'),
  ('cleaning_logs','location_id','public','locations','id','n'),
  ('compliance_documents','location_id','public','locations','id','n'),
  ('temperature_records','location_id','public','locations','id','n'),
  ('corrective_actions','location_id','public','locations','id','n'),
  ('marketing_promotions','location_id','public','locations','id','n'),
  ('cash_outs','location_id','public','locations','id','n'),
  ('staff_members','location_id','public','locations','id','n'),
  ('staff_shifts','staff_member_id','public','staff_members','id','c'),
  ('staff_shifts','location_id','public','locations','id','n'),
  ('corporate_dates','location_id','public','locations','id','n'),
  ('training_topics','location_id','public','locations','id','n'),
  ('training_sections','topic_id','public','training_topics','id','c'),
  ('inventory_items','location_id','public','locations','id','n'),
  ('inventory_counts','location_id','public','locations','id','n'),
  ('inventory_counts','item_id','public','inventory_items','id','c'),
  ('branding_requests','location_id','public','locations','id','n')
),
actual_foreign_keys AS (
  SELECT src.relname AS table_name,
         src_att.attname AS column_name,
         ref_ns.nspname AS ref_schema,
         ref.relname AS ref_table,
         ref_att.attname AS ref_column,
         con.confdeltype::text AS delete_action
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
  JOIN pg_catalog.pg_namespace src_ns ON src_ns.oid = src.relnamespace
  JOIN pg_catalog.pg_class ref ON ref.oid = con.confrelid
  JOIN pg_catalog.pg_namespace ref_ns ON ref_ns.oid = ref.relnamespace
  CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS sk(attnum, ord)
  JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS rk(attnum, ord)
    ON rk.ord = sk.ord
  JOIN pg_catalog.pg_attribute src_att
    ON src_att.attrelid = src.oid AND src_att.attnum = sk.attnum
  JOIN pg_catalog.pg_attribute ref_att
    ON ref_att.attrelid = ref.oid AND ref_att.attnum = rk.attnum
  WHERE con.contype = 'f' AND src_ns.nspname = 'public'
),
missing_foreign_keys AS (
  SELECT e.*
  FROM expected_foreign_keys e
  LEFT JOIN actual_foreign_keys a
    ON a.table_name = e.table_name
   AND a.column_name = e.column_name
   AND a.ref_schema = e.ref_schema
   AND a.ref_table = e.ref_table
   AND a.ref_column = e.ref_column
   AND a.delete_action = e.delete_action
  WHERE a.table_name IS NULL
),

-- CHECK constraints declared by migrations 1–24. This verifies a CHECK is
-- bound to each required column. Exact allowed-value equivalence is reported
-- separately as REVIEW because a catalog snapshot cannot prove migration
-- execution history.
expected_check_columns(table_name, column_name) AS (VALUES
  ('profiles','role'),
  ('temperature_records','record_type'),
  ('daily_checks','check_type'),
  ('cleaning_records','frequency'),
  ('corrective_actions','severity'),
  ('business_documents','doc_type'),
  ('staff_licenses','license_type'),
  ('marketing_promotions','month'),
  ('marketing_promotions','status'),
  ('marketing_promotions','category'),
  ('corporate_inspections','rating'),
  ('print_manuals','category'),
  ('social_media_calendar','day'),
  ('login_vault','category'),
  ('emergency_contacts','kind'),
  ('inventory_purchases','type'),
  ('inventory_purchases','amount')
),
missing_check_constraints AS (
  SELECT e.*
  FROM expected_check_columns e
  WHERE NOT EXISTS (
    SELECT 1 FROM constraint_columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = e.table_name
      AND c.contype = 'c'
      AND e.column_name::name = ANY(c.columns)
  )
),

-- Exact high-risk business constraints/indexes needed by inventory and roles.
critical_constraint_checks(check_name, is_present) AS (
  SELECT 'profiles canonical six-role CHECK', EXISTS (
    SELECT 1 FROM constraint_columns c
    WHERE c.table_schema='public' AND c.table_name='profiles' AND c.contype='c'
      AND c.definition ILIKE '%staff%' AND c.definition ILIKE '%manager%'
      AND c.definition ILIKE '%owner%' AND c.definition ILIKE '%multi_location_owner%'
      AND c.definition ILIKE '%corporate%' AND c.definition ILIKE '%designer%'
  )
  UNION ALL
  SELECT 'inventory_counts UNIQUE(item_id,count_month,location_id)', EXISTS (
    SELECT 1 FROM constraint_columns c
    WHERE c.table_schema='public' AND c.table_name='inventory_counts' AND c.contype='u'
      AND c.columns = ARRAY['item_id','count_month','location_id']::name[]
  )
  UNION ALL
  SELECT 'role_page_access PRIMARY KEY(role,page)', EXISTS (
    SELECT 1 FROM constraint_columns c
    WHERE c.table_schema='public' AND c.table_name='role_page_access' AND c.contype='p'
      AND c.columns = ARRAY['role','page']::name[]
  )
  UNION ALL
  SELECT 'inventory_purchases type CHECK(gfs/local)', EXISTS (
    SELECT 1 FROM constraint_columns c
    WHERE c.table_schema='public' AND c.table_name='inventory_purchases' AND c.contype='c'
      AND c.definition ILIKE '%type%' AND c.definition ILIKE '%gfs%' AND c.definition ILIKE '%local%'
  )
  UNION ALL
  SELECT 'inventory_purchases amount >= 0 CHECK', EXISTS (
    SELECT 1 FROM constraint_columns c
    WHERE c.table_schema='public' AND c.table_name='inventory_purchases' AND c.contype='c'
      AND c.definition ~* 'amount.*>=.*0'
  )
  UNION ALL
  SELECT 'uniq_gfs_invoice is partial UNIQUE(type,supplier,reference)', EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class idx
    JOIN pg_catalog.pg_namespace ns ON ns.oid=idx.relnamespace
    JOIN pg_catalog.pg_index ix ON ix.indexrelid=idx.oid
    WHERE ns.nspname='public' AND idx.relname='uniq_gfs_invoice'
      AND ix.indisunique
      AND pg_catalog.pg_get_indexdef(idx.oid) ILIKE '%(type, supplier, reference)%'
      AND pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) ILIKE '%type%gfs%'
      AND pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) ILIKE '%reference%not null%'
  )
),
failed_critical_constraints AS (
  SELECT check_name FROM critical_constraint_checks WHERE NOT is_present
),

-- Strict target specs used only if a target table unexpectedly already exists.
-- The expected_default_like pattern is checked only when non-NULL.
target_specs(table_name, column_name, expected_type, expected_not_null, expected_default_like) AS (VALUES
  ('inventory_month_snapshots','count_month','text',true,NULL),
  ('inventory_month_snapshots','opening_value','numeric(12,2)',true,'%0%'),
  ('inventory_month_snapshots','closing_value','numeric(12,2)',true,'%0%'),
  ('inventory_month_snapshots','purchases','numeric(12,2)',true,'%0%'),
  ('inventory_month_snapshots','sales','numeric(12,2)',false,NULL),
  ('inventory_month_snapshots','cogs','numeric(12,2)',false,NULL),
  ('inventory_month_snapshots','food_cost_pct','numeric(6,2)',false,NULL),
  ('inventory_month_snapshots','status','text',true,'%finalized%'),
  ('inventory_month_snapshots','finalized_by','text',false,NULL),
  ('inventory_month_snapshots','finalized_at','timestamp with time zone',true,'%now()%'),
  ('inventory_month_snapshots','reopened_by','text',false,NULL),
  ('inventory_month_snapshots','reopened_at','timestamp with time zone',false,NULL),
  ('inventory_month_snapshots','reopen_reason','text',false,NULL),
  ('inventory_month_snapshots','version','integer',true,'%1%'),
  ('inventory_month_snapshots','created_at','timestamp with time zone',true,'%now()%'),
  ('inventory_audit_log','id','bigint',true,'%nextval%'),
  ('inventory_audit_log','count_month','text',true,NULL),
  ('inventory_audit_log','action','text',true,NULL),
  ('inventory_audit_log','actor','text',false,NULL),
  ('inventory_audit_log','reason','text',false,NULL),
  ('inventory_audit_log','snapshot','jsonb',false,NULL),
  ('inventory_audit_log','version','integer',false,NULL),
  ('inventory_audit_log','created_at','timestamp with time zone',true,'%now()%')
),
target_spec_mismatches AS (
  SELECT e.table_name, e.column_name,
         CASE
           WHEN att.attname IS NULL THEN 'missing'
           WHEN pg_catalog.format_type(att.atttypid,att.atttypmod) <> e.expected_type THEN
             'type=' || pg_catalog.format_type(att.atttypid,att.atttypmod)
           WHEN att.attnotnull IS DISTINCT FROM e.expected_not_null THEN
             'not_null=' || att.attnotnull::text
           WHEN e.expected_default_like IS NOT NULL
            AND COALESCE(pg_catalog.pg_get_expr(def.adbin,def.adrelid),'') NOT ILIKE e.expected_default_like THEN
             'default=' || COALESCE(pg_catalog.pg_get_expr(def.adbin,def.adrelid),'NULL')
         END AS problem
  FROM target_specs e
  JOIN actual_public_tables tbl ON tbl.table_name=e.table_name
  LEFT JOIN pg_catalog.pg_attribute att
    ON att.attrelid=tbl.oid AND att.attname=e.column_name
   AND att.attnum > 0 AND NOT att.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef def
    ON def.adrelid=att.attrelid AND def.adnum=att.attnum
  WHERE att.attname IS NULL
     OR pg_catalog.format_type(att.atttypid,att.atttypmod) <> e.expected_type
     OR att.attnotnull IS DISTINCT FROM e.expected_not_null
     OR (e.expected_default_like IS NOT NULL
         AND COALESCE(pg_catalog.pg_get_expr(def.adbin,def.adrelid),'') NOT ILIKE e.expected_default_like)
),
target_extra_columns AS (
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN actual_public_tables t ON t.table_name=c.table_name
  LEFT JOIN target_specs e
    ON e.table_name=c.table_name AND e.column_name=c.column_name
  WHERE c.table_schema='public'
    AND c.table_name IN ('inventory_month_snapshots','inventory_audit_log')
    AND e.column_name IS NULL
),
target_health AS (
  SELECT 'inventory_month_snapshots'::text AS table_name,
         EXISTS(SELECT 1 FROM actual_public_tables WHERE table_name='inventory_month_snapshots') AS present,
         (
           EXISTS(SELECT 1 FROM actual_public_tables WHERE table_name='inventory_month_snapshots')
           AND NOT EXISTS(SELECT 1 FROM target_spec_mismatches WHERE table_name='inventory_month_snapshots')
           AND NOT EXISTS(SELECT 1 FROM target_extra_columns WHERE table_name='inventory_month_snapshots')
           AND EXISTS(
             SELECT 1 FROM constraint_columns c
             WHERE c.table_schema='public' AND c.table_name='inventory_month_snapshots'
               AND c.contype='p' AND c.columns=ARRAY['count_month']::name[]
           )
           AND EXISTS(
             SELECT 1 FROM constraint_columns c
             WHERE c.table_schema='public' AND c.table_name='inventory_month_snapshots'
               AND c.contype='c' AND c.definition ILIKE '%status%'
               AND c.definition ILIKE '%finalized%' AND c.definition ILIKE '%draft%'
           )
           AND EXISTS(
             SELECT 1 FROM actual_public_tables
             WHERE table_name='inventory_month_snapshots' AND relrowsecurity
           )
         ) AS structurally_compatible
  UNION ALL
  SELECT 'inventory_audit_log',
         EXISTS(SELECT 1 FROM actual_public_tables WHERE table_name='inventory_audit_log'),
         (
           EXISTS(SELECT 1 FROM actual_public_tables WHERE table_name='inventory_audit_log')
           AND NOT EXISTS(SELECT 1 FROM target_spec_mismatches WHERE table_name='inventory_audit_log')
           AND NOT EXISTS(SELECT 1 FROM target_extra_columns WHERE table_name='inventory_audit_log')
           AND EXISTS(
             SELECT 1 FROM constraint_columns c
             WHERE c.table_schema='public' AND c.table_name='inventory_audit_log'
               AND c.contype='p' AND c.columns=ARRAY['id']::name[]
           )
           AND EXISTS(
             SELECT 1 FROM pg_catalog.pg_indexes
             WHERE schemaname='public' AND tablename='inventory_audit_log'
               AND indexname='idx_inv_audit_month'
           )
           AND EXISTS(
             SELECT 1 FROM actual_public_tables
             WHERE table_name='inventory_audit_log' AND relrowsecurity
           )
         )
),

-- inventory_month_summary is a required application dependency but is not in
-- migrations.json. Check it separately and never pretend it proves a step.
summary_specs(column_name, expected_type, expected_not_null) AS (VALUES
  ('id','uuid',true),
  ('location_id','uuid',false),
  ('count_month','text',true),
  ('opening_value','numeric',true),
  ('purchases','numeric',true),
  ('sales','numeric',true),
  ('created_at','timestamp with time zone',false)
),
summary_spec_mismatches AS (
  SELECT e.column_name
  FROM summary_specs e
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='inventory_month_summary'
   AND c.column_name=e.column_name
  WHERE c.column_name IS NULL
     OR c.data_type <> e.expected_type
     OR (c.is_nullable='NO') IS DISTINCT FROM e.expected_not_null
),
summary_health AS (
  SELECT (
    EXISTS(SELECT 1 FROM actual_public_tables WHERE table_name='inventory_month_summary')
    AND NOT EXISTS(SELECT 1 FROM summary_spec_mismatches)
    AND EXISTS(
      SELECT 1 FROM constraint_columns c
      WHERE c.table_schema='public' AND c.table_name='inventory_month_summary'
        AND c.contype='p' AND c.columns=ARRAY['id']::name[]
    )
    AND EXISTS(
      SELECT 1 FROM constraint_columns c
      WHERE c.table_schema='public' AND c.table_name='inventory_month_summary'
        AND c.contype='u' AND c.columns=ARRAY['count_month','location_id']::name[]
    )
    AND EXISTS(
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname='public' AND tablename='inventory_month_summary'
        AND indexname='idx_inventory_month_summary_month'
    )
    AND EXISTS(
      SELECT 1 FROM actual_public_tables
      WHERE table_name='inventory_month_summary' AND relrowsecurity
    )
  ) AS ok
),

missing_core_rls AS (
  SELECT e.table_name
  FROM expected_table_columns e
  LEFT JOIN actual_public_tables a USING(table_name)
  WHERE e.step_no NOT IN (25,26)
    AND COALESCE(a.relrowsecurity,false)=false
),

required_functions(signature) AS (VALUES
  ('public.handle_new_user()'),
  ('public.purge_expired_operational()'),
  ('public.purge_cash_outs()'),
  ('public.purge_staff_schedule()'),
  ('public.purge_inventory_counts()'),
  ('public.purge_branding_requests()')
),
missing_functions AS (
  SELECT signature FROM required_functions
  WHERE pg_catalog.to_regprocedure(signature) IS NULL
),
auth_trigger_health AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='auth' AND c.relname='users'
      AND t.tgname='on_auth_user_created' AND NOT t.tgisinternal
  ) AS ok
),

expected_storage_buckets(bucket_id) AS (VALUES
  ('ops-photos'),('cleaning-photos'),('inspection-photos'),('training-videos')
),
missing_storage_buckets AS (
  SELECT e.bucket_id
  FROM expected_storage_buckets e
  LEFT JOIN storage.buckets b ON b.id=e.bucket_id
  WHERE b.id IS NULL
),
expected_storage_policies(policy_name) AS (VALUES
  ('ops_photos_select'),('ops_photos_insert'),('ops_photos_update'),('ops_photos_delete'),
  ('cleaning-photos_select'),('cleaning-photos_insert'),('cleaning-photos_update'),('cleaning-photos_delete'),
  ('inspection-photos_select'),('inspection-photos_insert'),('inspection-photos_update'),('inspection-photos_delete'),
  ('training-videos_select'),('training-videos_insert'),('training-videos_update'),('training-videos_delete')
),
missing_storage_policies AS (
  SELECT e.policy_name
  FROM expected_storage_policies e
  LEFT JOIN pg_catalog.pg_policies p
    ON p.schemaname='storage' AND p.tablename='objects'
   AND p.policyname=e.policy_name
  WHERE p.policyname IS NULL
),

-- Sensitive inventory/access tables only. The public ALL policies and anon
-- grants are findings (FAIL), not prerequisites to be silently accepted.
sensitive_tables(table_name) AS (VALUES
  ('inventory_purchases'),('inventory_counts'),('inventory_items'),
  ('inventory_month_summary'),('inventory_month_snapshots'),
  ('inventory_audit_log'),('role_page_access')
),
permissive_public_policies AS (
  SELECT p.tablename, p.policyname
  FROM pg_catalog.pg_policies p
  JOIN sensitive_tables s ON s.table_name=p.tablename
  WHERE p.schemaname='public' AND p.cmd='ALL'
    AND ('public'::name=ANY(p.roles) OR 'anon'::name=ANY(p.roles))
    AND regexp_replace(COALESCE(p.qual,''),'[()[:space:]]','','g')='true'
    AND regexp_replace(COALESCE(p.with_check,''),'[()[:space:]]','','g')='true'
),
anon_public_grants AS (
  SELECT g.table_name, g.grantee, g.privilege_type
  FROM information_schema.table_privileges g
  JOIN sensitive_tables s ON s.table_name=g.table_name
  WHERE g.table_schema='public'
    AND g.grantee IN ('anon','PUBLIC')
    AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
),

ledger_objects AS (
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_name='_migrations'
),

-- Exact counts only; no rows or customer fields are returned.
prototype_counts AS (
  SELECT
    (SELECT count(*) FROM public.inventory_counts) AS inventory_counts,
    (SELECT count(*) FROM public.inventory_items) AS inventory_items,
    (SELECT count(*) FROM public.inventory_month_summary) AS inventory_month_summary,
    (SELECT count(*) FROM public.inventory_purchases) AS inventory_purchases,
    (SELECT count(*) FROM public.role_page_access) AS role_page_access
),

-- Definite static blockers to a baseline. Even with zero blockers the answer
-- remains REVIEW: catalogs cannot prove step-23 seed/data equivalence or that
-- every file actually executed, and --baseline performs no validation itself.
structural_blockers AS (
  SELECT
    (SELECT count(*) FROM missing_core_tables)
    + (SELECT count(*) FROM missing_core_columns)
    + (SELECT count(*) FROM missing_core_indexes)
    + (SELECT count(*) FROM missing_core_primary_keys)
    + (SELECT count(*) FROM missing_foreign_keys)
    + (SELECT count(*) FROM missing_check_constraints)
    + (SELECT count(*) FROM failed_critical_constraints)
    + (SELECT count(*) FROM missing_core_rls)
    + (SELECT count(*) FROM missing_functions)
    + CASE WHEN (SELECT ok FROM auth_trigger_health) THEN 0 ELSE 1 END
    + (SELECT count(*) FROM missing_storage_buckets)
    + (SELECT count(*) FROM missing_storage_policies)
    + CASE WHEN (SELECT ok FROM summary_health) THEN 0 ELSE 1 END
    + (SELECT count(*) FROM target_health WHERE NOT structurally_compatible)
      AS blocker_count
),

checks_base(check_order, area, check_name, status, details) AS (
  SELECT 10, 'SCHEMA', 'Migration tables (steps 1–24 and 27)',
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_tables) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_tables)
              THEN format('%s missing: %s',
                   (SELECT count(*) FROM missing_core_tables),
                   (SELECT left(string_agg(format('s%s:%s',step_no,table_name),', ' ORDER BY step_no,table_name),700) FROM missing_core_tables))
              ELSE format('All %s required public tables exist.',
                   (SELECT count(*) FROM expected_table_columns WHERE step_no NOT IN (25,26))) END
  UNION ALL
  SELECT 20, 'SCHEMA', 'Migration columns (steps 1–24 and 27)',
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_columns) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_columns)
              THEN format('%s missing: %s',
                   (SELECT count(*) FROM missing_core_columns),
                   (SELECT left(string_agg(format('s%s:%s.%s',step_no,table_name,column_name),', ' ORDER BY step_no,table_name,column_name),700) FROM missing_core_columns))
              ELSE format('All %s required columns exist.',
                   (SELECT count(*) FROM expected_columns WHERE step_no NOT IN (25,26))) END
  UNION ALL
  SELECT 30, 'TARGET', 'Step 25 inventory_month_snapshots',
         CASE WHEN NOT present THEN 'PASS' WHEN structurally_compatible THEN 'REVIEW' ELSE 'FAIL' END,
         CASE WHEN NOT present THEN 'Absent as expected before 02; structure is not assumed.'
              WHEN structurally_compatible THEN 'Already exists and static shape is compatible; REVIEW before running 02.'
              ELSE format('Exists but is incompatible. Problems: %s',
                   COALESCE((SELECT left(string_agg(column_name||'='||problem,', '),700)
                             FROM target_spec_mismatches WHERE table_name='inventory_month_snapshots'),
                            'constraint/index/RLS mismatch or extra columns')) END
  FROM target_health WHERE table_name='inventory_month_snapshots'
  UNION ALL
  SELECT 31, 'TARGET', 'Step 26 inventory_audit_log',
         CASE WHEN NOT present THEN 'PASS' WHEN structurally_compatible THEN 'REVIEW' ELSE 'FAIL' END,
         CASE WHEN NOT present THEN 'Absent as expected before 02; structure is not assumed.'
              WHEN structurally_compatible THEN 'Already exists and static shape is compatible; REVIEW before running 02.'
              ELSE format('Exists but is incompatible. Problems: %s',
                   COALESCE((SELECT left(string_agg(column_name||'='||problem,', '),700)
                             FROM target_spec_mismatches WHERE table_name='inventory_audit_log'),
                            'constraint/index/RLS mismatch or extra columns')) END
  FROM target_health WHERE table_name='inventory_audit_log'
  UNION ALL
  SELECT 35, 'TARGET', 'Inventory runtime schema complete',
         CASE WHEN (SELECT bool_and(structurally_compatible) FROM target_health) THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN (SELECT bool_and(structurally_compatible) FROM target_health)
              THEN 'Both snapshot and audit tables are structurally ready.'
              ELSE 'Not ready: steps 25/26 are absent or incompatible; finalization/audit cannot work yet.' END
  UNION ALL
  SELECT 40, 'DEPENDENCY', 'inventory_month_summary (outside migrations.json)',
         CASE WHEN (SELECT ok FROM summary_health) THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN (SELECT ok FROM summary_health)
              THEN 'Table, 7 columns/types, PK, UNIQUE(count_month,location_id), index and RLS found.'
              ELSE format('Required manual dependency is incomplete. Column mismatches: %s',
                   COALESCE((SELECT string_agg(column_name,', ' ORDER BY column_name) FROM summary_spec_mismatches),'none; check constraints/index/RLS')) END
  UNION ALL
  SELECT 50, 'INDEX', 'Explicit migration indexes (before steps 25/26)',
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_indexes) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_indexes)
              THEN format('%s missing: %s', (SELECT count(*) FROM missing_core_indexes),
                   (SELECT left(string_agg(table_name||'.'||index_name,', ' ORDER BY step_no,index_name),700) FROM missing_core_indexes))
              ELSE format('All %s explicit indexes found.', (SELECT count(*) FROM expected_indexes WHERE step_no NOT IN (25,26))) END
  UNION ALL
  SELECT 60, 'CONSTRAINT', 'Primary keys on migration tables',
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_primary_keys) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_primary_keys)
              THEN format('%s table(s) missing PK: %s', (SELECT count(*) FROM missing_core_primary_keys),
                   (SELECT left(string_agg(table_name,', ' ORDER BY table_name),700) FROM missing_core_primary_keys))
              ELSE 'Every required pre-25/26 migration table has a primary key.' END
  UNION ALL
  SELECT 61, 'CONSTRAINT', 'Foreign keys and delete actions',
         CASE WHEN EXISTS(SELECT 1 FROM missing_foreign_keys) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_foreign_keys)
              THEN format('%s missing/mismatched: %s', (SELECT count(*) FROM missing_foreign_keys),
                   (SELECT left(string_agg(table_name||'.'||column_name||'->'||ref_schema||'.'||ref_table||'.'||ref_column,', ' ORDER BY table_name,column_name),700) FROM missing_foreign_keys))
              ELSE format('All %s declared single-column foreign keys and delete actions match.', (SELECT count(*) FROM expected_foreign_keys)) END
  UNION ALL
  SELECT 62, 'CONSTRAINT', 'Required CHECK constraints present',
         CASE WHEN EXISTS(SELECT 1 FROM missing_check_constraints) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_check_constraints)
              THEN format('%s missing: %s', (SELECT count(*) FROM missing_check_constraints),
                   (SELECT string_agg(table_name||'.'||column_name,', ' ORDER BY table_name,column_name) FROM missing_check_constraints))
              ELSE format('CHECK constraints found on all %s required columns.', (SELECT count(*) FROM expected_check_columns)) END
  UNION ALL
  SELECT 63, 'CONSTRAINT', 'Critical role/inventory constraint semantics',
         CASE WHEN EXISTS(SELECT 1 FROM failed_critical_constraints) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM failed_critical_constraints)
              THEN format('%s failed: %s', (SELECT count(*) FROM failed_critical_constraints),
                   (SELECT string_agg(check_name,', ' ORDER BY check_name) FROM failed_critical_constraints))
              ELSE format('All %s critical semantic checks pass.', (SELECT count(*) FROM critical_constraint_checks)) END
  UNION ALL
  SELECT 70, 'RLS', 'RLS enabled on migration tables (before steps 25/26)',
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_rls) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_core_rls)
              THEN format('%s missing/disabled: %s', (SELECT count(*) FROM missing_core_rls),
                   (SELECT left(string_agg(table_name,', ' ORDER BY table_name),700) FROM missing_core_rls))
              ELSE 'RLS is enabled on every required pre-25/26 migration table.' END
  UNION ALL
  SELECT 75, 'RUNTIME', 'Required functions and auth trigger',
         CASE WHEN EXISTS(SELECT 1 FROM missing_functions) OR NOT (SELECT ok FROM auth_trigger_health) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_functions) OR NOT (SELECT ok FROM auth_trigger_health)
              THEN format('Missing functions: %s; auth trigger present: %s',
                   COALESCE((SELECT string_agg(signature,', ' ORDER BY signature) FROM missing_functions),'none'),
                   (SELECT ok FROM auth_trigger_health))
              ELSE 'All 6 required functions and auth.users trigger found.' END
  UNION ALL
  SELECT 76, 'RUNTIME', 'Migration-declared extensions recorded',
         CASE WHEN EXISTS(
                SELECT 1 FROM (VALUES ('uuid-ossp'),('pgcrypto')) e(name)
                LEFT JOIN pg_catalog.pg_extension x ON x.extname=e.name
                WHERE x.oid IS NULL
              ) THEN 'REVIEW' ELSE 'PASS' END,
         CASE WHEN EXISTS(
                SELECT 1 FROM (VALUES ('uuid-ossp'),('pgcrypto')) e(name)
                LEFT JOIN pg_catalog.pg_extension x ON x.extname=e.name
                WHERE x.oid IS NULL
              ) THEN 'An extension record is missing; PostgreSQL may provide equivalent built-ins, so manual review is required.'
              ELSE 'uuid-ossp and pgcrypto extension records found (query does not call either extension).' END
  UNION ALL
  SELECT 80, 'STORAGE', 'Storage buckets and policies (steps 9/22)',
         CASE WHEN EXISTS(SELECT 1 FROM missing_storage_buckets) OR EXISTS(SELECT 1 FROM missing_storage_policies) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM missing_storage_buckets) OR EXISTS(SELECT 1 FROM missing_storage_policies)
              THEN format('Missing buckets: %s; missing policies: %s',
                   COALESCE((SELECT string_agg(bucket_id,', ') FROM missing_storage_buckets),'none'),
                   COALESCE((SELECT string_agg(policy_name,', ') FROM missing_storage_policies),'none'))
              ELSE 'All 4 migration buckets and 16 named storage policies found.' END
  UNION ALL
  SELECT 90, 'DATA', 'role_page_access rows preserved',
         CASE WHEN role_page_access=67 THEN 'PASS' WHEN role_page_access<67 THEN 'FAIL' ELSE 'REVIEW' END,
         format('row_count=%s; expected confirmed baseline=67 (no rows were read).',role_page_access)
  FROM prototype_counts
  UNION ALL
  SELECT 91, 'DATA', 'Prototype inventory row-count baseline',
         CASE WHEN inventory_counts=0 AND inventory_items=0 AND inventory_month_summary=0 AND inventory_purchases=0
              THEN 'PASS' ELSE 'REVIEW' END,
         format('counts=%s, items=%s, summary=%s, purchases=%s; nonzero may be legitimate new use and is not assumed wrong.',
                inventory_counts,inventory_items,inventory_month_summary,inventory_purchases)
  FROM prototype_counts
  UNION ALL
  SELECT 100, 'SECURITY', 'Permissive public/anon ALL policies',
         CASE WHEN EXISTS(SELECT 1 FROM permissive_public_policies) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM permissive_public_policies)
              THEN format('%s exposed policies: %s', (SELECT count(*) FROM permissive_public_policies),
                   (SELECT string_agg(tablename||'.'||policyname,', ' ORDER BY tablename,policyname) FROM permissive_public_policies))
              ELSE 'No permissive public/anon ALL policy found on the 7 sensitive tables.' END
  UNION ALL
  SELECT 101, 'SECURITY', 'anon/PUBLIC table grants on sensitive tables',
         CASE WHEN EXISTS(SELECT 1 FROM anon_public_grants) THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN EXISTS(SELECT 1 FROM anon_public_grants)
              THEN format('%s exposed grants: %s', (SELECT count(*) FROM anon_public_grants),
                   (SELECT left(string_agg(table_name||':'||grantee||':'||privilege_type,', ' ORDER BY table_name,grantee,privilege_type),700) FROM anon_public_grants))
              ELSE 'No anon/PUBLIC grants found on the 7 sensitive tables.' END
  UNION ALL
  SELECT 110, 'LEDGER', 'Migration ledger status', 'REVIEW',
         CASE WHEN EXISTS(SELECT 1 FROM ledger_objects)
              THEN format('_migrations found in: %s. Contents/checksums are intentionally not assumed valid; inspect before reconciliation.',
                   (SELECT string_agg(table_schema,', ' ORDER BY table_schema) FROM ledger_objects))
              ELSE 'No visible _migrations table. Migration execution history is unavailable; this does not prove migrations ran.' END
  UNION ALL
  SELECT 111, 'LEDGER', 'Step 23 seed/data equivalence', 'REVIEW',
         'Not queried: proving seed-demo equivalence would inspect auth/customer rows and still would not prove execution history.'
  UNION ALL
  SELECT 112, 'RECOVERY', 'Backup/restore readiness', 'REVIEW',
         'Cannot be verified safely by SQL catalog inspection; confirm a usable restore point in the Supabase dashboard.'
  UNION ALL
  SELECT 113, 'LEDGER', 'Is --baseline 27 safe now?',
         CASE WHEN blocker_count>0 THEN 'FAIL' ELSE 'REVIEW' END,
         CASE WHEN blocker_count>0
              THEN format('NO: %s static blocker(s), including absent/incompatible steps 25/26 if not deployed. Do not baseline.',blocker_count)
              ELSE 'Static checks pass, but baseline remains REVIEW: the runner validates no schema and seed/data/file-execution equivalence is unprovable from catalogs.' END
  FROM structural_blockers
  UNION ALL
  SELECT 120, 'DEPLOYMENT', 'SQL schema ready for 02-create-missing-tables.sql',
         CASE
           WHEN EXISTS(SELECT 1 FROM target_health WHERE present) THEN 'REVIEW'
           WHEN NOT (SELECT ok FROM summary_health) THEN 'FAIL'
           WHEN EXISTS(
             SELECT 1 FROM missing_core_tables
             WHERE table_name IN ('inventory_items','inventory_counts','inventory_purchases','role_page_access')
           ) THEN 'FAIL'
           WHEN EXISTS(
             SELECT 1 FROM missing_core_columns
             WHERE table_name IN ('inventory_items','inventory_counts','inventory_purchases','role_page_access')
           ) THEN 'FAIL'
           ELSE 'PASS'
         END,
         CASE
           WHEN EXISTS(SELECT 1 FROM target_health WHERE present)
             THEN 'A target already exists; review its TARGET row before running 02.'
           WHEN NOT (SELECT ok FROM summary_health)
             THEN 'Required inventory_month_summary dependency is incomplete.'
           WHEN EXISTS(
             SELECT 1 FROM missing_core_tables
             WHERE table_name IN ('inventory_items','inventory_counts','inventory_purchases','role_page_access')
           ) OR EXISTS(
             SELECT 1 FROM missing_core_columns
             WHERE table_name IN ('inventory_items','inventory_counts','inventory_purchases','role_page_access')
           ) THEN 'A required existing inventory/access table or column is missing.'
           ELSE 'Static inventory prerequisites pass and both target tables are absent. Recovery readiness is still a separate REVIEW.'
         END
),
checks AS (
  SELECT * FROM checks_base
  UNION ALL
  SELECT 999, 'SUMMARY', 'Compact preflight overall',
         CASE WHEN EXISTS(SELECT 1 FROM checks_base WHERE status='FAIL') THEN 'FAIL'
              WHEN EXISTS(SELECT 1 FROM checks_base WHERE status='REVIEW') THEN 'REVIEW'
              ELSE 'PASS' END,
         format('PASS=%s, FAIL=%s, REVIEW=%s. Resolve concrete FAILs; REVIEW is never an assumed PASS.',
                (SELECT count(*) FROM checks_base WHERE status='PASS'),
                (SELECT count(*) FROM checks_base WHERE status='FAIL'),
                (SELECT count(*) FROM checks_base WHERE status='REVIEW'))
)
SELECT check_order, area, check_name, status, details
FROM checks
ORDER BY check_order;
