-- ===========================================================================
-- 04 — SECURITY HARDENING (anon access removal)     ***  NOT RUN AUTOMATICALLY
--                                                   ***  READ PREREQUISITES ***
-- ===========================================================================
--
-- Sections 4.1–4.2 are READ-ONLY inspection and safe to run now.
-- Section 4.3 (the actual revokes/policy drops) is intentionally COMMENTED
-- OUT. It removes the anonymous-access exposure on the seven inventory /
-- access-matrix tables — real protection, not theatre — but it must not run
-- until the application provably works WITHOUT anon access.
--
-- PREREQUISITES — ALL must be true before uncommenting 4.3:
--   [ ] The app is deployed at commit "server-side inventory" or later
--       (this commit): every former browser→Supabase operation now goes
--       through /api/btb/* routes with BTB cookie auth — count-sheet save,
--       sales save, add/delete item, all reads, finalize/reopen, purchases,
--       role-page-access. Regression tests pin this (tests/server-db-clients).
--   [ ] SUPABASE_SERVICE_ROLE_KEY is set in the SERVER environment only
--       (never NEXT_PUBLIC_*, never committed) and the app was redeployed so
--       the routes use the privileged client. (Without it the routes fall
--       back to anon and revoking would break them.)
--   [ ] 03-verify.sql passes and the workflows were exercised end-to-end:
--       load the month-end page, save counts, save sales, add/remove an
--       item, record a purchase, finalize, reopen — all as manager/admin.
--
-- WHY BOTH REVOKE AND POLICY DROP: PostgREST checks the table GRANT before
-- RLS. Supabase's default privileges grant anon ALL on public tables, so
-- dropping the permissive policies alone still leaves table access, and
-- revoking alone still leaves RLS wide open if any grant remains. Both go.
-- service_role bypasses RLS and keeps full access via its default grants
-- (re-asserted in 4.3.4).
--
-- ===========================================================================

-- 4.1 INSPECTION (safe now): current grants to PostgREST roles.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
                     'inventory_month_summary','inventory_month_snapshots',
                     'inventory_audit_log','role_page_access')
  AND grantee IN ('anon','authenticated','service_role')
ORDER BY table_name, grantee, privilege_type;

-- 4.2 INSPECTION (safe now): permissive policies (the *_public_all family).
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','inventory_month_snapshots',
                    'inventory_audit_log','role_page_access')
ORDER BY tablename, policyname;


-- ===========================================================================
-- 4.3 THE HARDENING — *** COMMENTED OUT. DO NOT RUN UNTIL PREREQUISITES. ***
-- ===========================================================================

-- 4.3.1 Remove anon table privileges (PostgREST layer).
-- REVOKE ALL ON TABLE inventory_purchases       FROM anon;
-- REVOKE ALL ON TABLE inventory_counts          FROM anon;
-- REVOKE ALL ON TABLE inventory_items           FROM anon;
-- REVOKE ALL ON TABLE inventory_month_summary   FROM anon;
-- REVOKE ALL ON TABLE inventory_month_snapshots FROM anon;
-- REVOKE ALL ON TABLE inventory_audit_log       FROM anon;
-- REVOKE ALL ON TABLE role_page_access          FROM anon;

-- 4.3.2 Drop the permissive RLS policies (RLS layer).
-- DROP POLICY IF EXISTS "inv_purch_public_all"             ON inventory_purchases;
-- DROP POLICY IF EXISTS "inventory_counts_public_all"      ON inventory_counts;
-- DROP POLICY IF EXISTS "inventory_items_public_all"       ON inventory_items;
-- DROP POLICY IF EXISTS "inventory_month_summary_public_all" ON inventory_month_summary;
-- DROP POLICY IF EXISTS "ims_public_all"                   ON inventory_month_snapshots;
-- DROP POLICY IF EXISTS "ial_public_all"                   ON inventory_audit_log;
-- DROP POLICY IF EXISTS "rpa_public_all"                   ON role_page_access;

-- 4.3.3 Document service_role-only intent (auditable in pg_policies;
--      service_role bypasses RLS regardless).
-- CREATE POLICY "inv_purch_service_only"    ON inventory_purchases       FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "inv_count_service_only"    ON inventory_counts          FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "inv_items_service_only"    ON inventory_items           FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "inv_summary_service_only"  ON inventory_month_summary   FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "ims_service_only"          ON inventory_month_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "ial_service_only"          ON inventory_audit_log       FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "rpa_service_only"          ON role_page_access          FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.3.4 Ensure service_role keeps full access (harmless if already granted).
-- GRANT ALL ON TABLE inventory_purchases       TO service_role;
-- GRANT ALL ON TABLE inventory_counts          TO service_role;
-- GRANT ALL ON TABLE inventory_items           TO service_role;
-- GRANT ALL ON TABLE inventory_month_summary   TO service_role;
-- GRANT ALL ON TABLE inventory_month_snapshots TO service_role;
-- GRANT ALL ON TABLE inventory_audit_log       TO service_role;
-- GRANT ALL ON TABLE role_page_access          TO service_role;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- ===========================================================================
-- 4.4 POST-4.3 VERIFICATION — this stage is only "done" when DIRECT anon
--     REST probes fail, not when the catalog looks right.
-- ===========================================================================

-- 4.4.1 Catalog: expect 0 anon grants and 0 *_public_all policies.
-- SELECT table_name, grantee FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND grantee='anon'
--   AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
--                      'inventory_month_summary','inventory_month_snapshots',
--                      'inventory_audit_log','role_page_access');
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname='public' AND policyname LIKE '%public_all';

-- 4.4.2 DIRECT ANON REST PROBES — run from a terminal with the ANON key
--      (obtain it yourself; never paste it into a ticket or chat):
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     "$SUPABASE_URL/rest/v1/inventory_purchases?select=*&limit=1" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--   EXPECT: 401 or 403. (Before hardening this returns 200 — the exposure.)
--
--   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
--     "$SUPABASE_URL/rest/v1/inventory_purchases" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     -H "Content-Type: application/json" -H "Prefer: return=minimal" \
--     -d '{"count_month":"1900-01","purchase_date":"1900-01-01","type":"local","description":"probe","amount":0}'
--   EXPECT: 401 or 403. Never probe with real data; delete any probe row.
--
-- 4.4.3 Then re-test the app end-to-end (page load, save, finalize) to prove
--      the server routes still work with anon locked out.
