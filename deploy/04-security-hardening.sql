-- ============================================================================
-- FINAL INVENTORY SECURITY HARDENING — MANUAL, GUARDED, IDEMPOTENT
--
-- DO NOT RUN until ALL are true:
--   1. The application commit named in the final report is deployed.
--   2. SUPABASE_SERVICE_ROLE_KEY is configured in the HOSTING environment
--      only (never NEXT_PUBLIC_*) and the app was redeployed after setting it.
--   3. While signed in as BTB manager/admin,
--      GET /api/btb/inventory-health returns HTTP 200 with:
--        { ok: true, deployment: "inventory-server-v3",
--          serviceRoleConfigured: true, ... }
--   4. The current backend-owned BTB login code is deployed.
--
-- EFFECT:
--   * Preserves every row, including all role_page_access rows.
--   * Revokes direct table access from anon, authenticated and PUBLIC on the
--     seven protected inventory/access tables.
--   * Drops the seven permissive USING(true)/WITH CHECK(true) policies.
--   * Keeps RLS enabled.
--   * Grants only the operations actually used by server routes to
--     service_role. service_role bypasses RLS; no fake service-only policy is
--     needed.
--   * Revokes public access to the audit BIGSERIAL sequence.
--
-- It does NOT drop/truncate a table, change a row, seed data, or touch the
-- migration ledger. Everything is one transaction; any failed guard rolls it
-- all back.
-- ============================================================================

BEGIN;

-- Guard every required relation/role before changing permissions.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name) INTO missing
  FROM unnest(ARRAY[
    'inventory_purchases','inventory_counts','inventory_items',
    'inventory_month_summary','inventory_month_snapshots',
    'inventory_audit_log','role_page_access'
  ]) AS t(name)
  WHERE to_regclass('public.' || name) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'HARDENING ABORTED: missing required table(s): %', missing;
  END IF;
  IF to_regclass('public.inventory_audit_log_id_seq') IS NULL THEN
    RAISE EXCEPTION 'HARDENING ABORTED: inventory_audit_log_id_seq is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'HARDENING ABORTED: database role service_role is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    RAISE EXCEPTION 'HARDENING ABORTED: Supabase API roles are missing';
  END IF;
END $$;

-- Defense in depth: keep RLS on even though direct public grants are removed.
ALTER TABLE inventory_purchases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_month_summary   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_month_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_page_access          ENABLE ROW LEVEL SECURITY;

-- Remove all direct browser/API-role privileges. The application has no
-- browser imports for these tables; it uses BTB-authenticated server routes.
REVOKE ALL PRIVILEGES ON TABLE inventory_purchases       FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE inventory_counts          FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE inventory_items           FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE inventory_month_summary   FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE inventory_month_snapshots FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE inventory_audit_log       FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE role_page_access          FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE inventory_audit_log_id_seq FROM anon, authenticated, PUBLIC;

-- Remove the known permissive policies. No replacement policy is necessary:
-- service_role has BYPASSRLS in Supabase and is available only on the server.
DROP POLICY IF EXISTS "inv_purch_public_all"               ON inventory_purchases;
DROP POLICY IF EXISTS "inventory_counts_public_all"        ON inventory_counts;
DROP POLICY IF EXISTS "inventory_items_public_all"         ON inventory_items;
DROP POLICY IF EXISTS "inventory_month_summary_public_all" ON inventory_month_summary;
DROP POLICY IF EXISTS "ims_public_all"                     ON inventory_month_snapshots;
DROP POLICY IF EXISTS "ial_public_all"                     ON inventory_audit_log;
DROP POLICY IF EXISTS "rpa_public_all"                     ON role_page_access;

-- Least privilege for the server routes (not ALL/TRUNCATE/REFERENCES/TRIGGER).
GRANT SELECT, INSERT                         ON inventory_purchases       TO service_role;
GRANT SELECT, INSERT, DELETE                 ON inventory_counts          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE         ON inventory_items           TO service_role;
GRANT SELECT, INSERT, DELETE                 ON inventory_month_summary   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE         ON inventory_month_snapshots TO service_role;
GRANT SELECT, INSERT                         ON inventory_audit_log       TO service_role;
GRANT SELECT, INSERT, UPDATE                 ON role_page_access          TO service_role;
GRANT USAGE, SELECT ON SEQUENCE inventory_audit_log_id_seq TO service_role;

-- Fail/rollback if any policy still grants a protected table to a browser API
-- role (including PUBLIC, which contains anon/authenticated).
DO $$
DECLARE
  exposed TEXT;
BEGIN
  SELECT string_agg(format('%I.%I', tablename, policyname), ', ' ORDER BY tablename, policyname)
    INTO exposed
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN (
      'inventory_purchases','inventory_counts','inventory_items',
      'inventory_month_summary','inventory_month_snapshots',
      'inventory_audit_log','role_page_access'
    )
    AND (
      'public'::name = ANY(roles)
      OR 'anon'::name = ANY(roles)
      OR 'authenticated'::name = ANY(roles)
    );

  IF exposed IS NOT NULL THEN
    RAISE EXCEPTION 'HARDENING ABORTED: browser-accessible policies remain: %', exposed;
  END IF;
END $$;

COMMIT;

-- Compact catalog verification. Expected: 7 rows, anon_grants=0,
-- authenticated_grants=0, public_policies=0, rls_enabled=true.
SELECT t.table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*)
        FROM information_schema.table_privileges g
        WHERE g.table_schema='public' AND g.table_name=t.table_name
          AND g.grantee IN ('anon','PUBLIC')) AS anon_grants,
       (SELECT count(*)
        FROM information_schema.table_privileges g
        WHERE g.table_schema='public' AND g.table_name=t.table_name
          AND g.grantee='authenticated') AS authenticated_grants,
       (SELECT count(*)
        FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=t.table_name
          AND ('public'::name=ANY(p.roles) OR 'anon'::name=ANY(p.roles)
               OR 'authenticated'::name=ANY(p.roles))) AS public_policies
FROM (VALUES
  ('inventory_purchases'),('inventory_counts'),('inventory_items'),
  ('inventory_month_summary'),('inventory_month_snapshots'),
  ('inventory_audit_log'),('role_page_access')
) AS t(table_name)
JOIN pg_class c ON c.oid=to_regclass('public.' || t.table_name)
ORDER BY t.table_name;

-- Preservation check only (no row data): expected current baseline is 67.
SELECT count(*) AS role_page_access_rows_after_hardening FROM role_page_access;
