-- ===========================================================================
-- STAGE C — ANONYMOUS-ACCESS SECURITY                    ***  B L O C K E D  ***
-- ===========================================================================
--
-- *** DO NOT RUN THE STATEMENTS IN SECTION C3 YET. ***
-- Section C3 is intentionally COMMENTED OUT. Sections C1–C2 are read-only
-- inspection and can be run at any time.
--
-- WHY BLOCKED — the revoke/drop below would break the live application
-- because the access architecture it depends on DOES NOT EXIST YET:
--
--   1. No server-only privileged client exists. The repo's sole Supabase
--      client is the browser/anon client (src/lib/supabase.ts), imported by
--      49 files including every inventory API route. There is no
--      SUPABASE_SERVICE_ROLE_KEY anywhere in the repo or env template.
--   2. The month-end inventory PAGE writes inventory_counts,
--      inventory_items and inventory_month_summary DIRECTLY from the browser
--      via the anon key (src/app/between-the-buns/month-end-inventory/page.tsx,
--      lines 165/171/232/249/271/293). Revoking anon today breaks counting.
--   3. BTB authorizes with its own cookie (src/lib/btb-auth.ts), NOT a
--      Supabase Auth identity. There is no verified identity → RLS row
--      mapping to grant `authenticated` against, so an RLS-only redesign
--      would require inventing an identity mapping — out of scope here and
--      unsafe to guess.
--
-- BEFORE C3 MAY BE RUN, ALL of the following must be true:
--   [ ] A service-role key exists in the Supabase dashboard and is stored
--       ONLY in server-side env (e.g. SUPABASE_SERVICE_ROLE_KEY) — never in
--       any NEXT_PUBLIC_* variable, never in the browser bundle.
--   [ ] A server-only client module exists (e.g. src/lib/supabase-server.ts)
--       that creates its client with the service-role key, is imported ONLY
--       from server code (API routes / server actions), and is guarded so a
--       client import fails (e.g. `import "server-only"`).
--   [ ] ALL inventory API routes (inventory-finalize, inventory-reopen,
--       inventory-purchases, inventory-opening, inventory-snapshot) use that
--       server client instead of the anon client.
--   [ ] The month-end page's direct writes to inventory_counts,
--       inventory_items and inventory_month_summary have been MOVED BEHIND
--       authenticated API routes (BTB cookie check + role check) using the
--       server client.
--   [ ] End-to-end workflows re-tested: count entry, purchase entry,
--       finalize, reopen, snapshot read.
--   [ ] Post-deploy, DIRECT anon REST reads AND writes are verified denied
--       with real requests (see README "Stage C verification"). Do not claim
--       this stage complete until those probes fail.
--
-- WHAT C3 DOES (when unblocked):
--   * REVOKEs table privileges from `anon` on the seven sensitive tables.
--     Revoking is required in addition to dropping RLS policies: Supabase's
--     default privileges grant anon/authenticated ALL on public tables, and
--     PostgREST checks the GRANT before RLS. Policy removal alone is NOT
--     sufficient — and GRANT removal alone is NOT sufficient either, because
--     `service_role` bypasses RLS while anon would still pass permissive
--     policies if any grant remained. Both are removed.
--   * DROPs the permissive USING(true)/WITH CHECK(true) policies.
--   * Preserves server-side access: the service_role key bypasses RLS and
--     keeps working through the grants listed below (Supabase grants
--     service_role at project setup; if the explicit grants in C3.4 are
--     missing on the new tables, run them once).
--   * Adds explicit service_role-only policies so intent is documented in
--     the catalog even though service_role bypasses RLS.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- C1. INSPECTION (read-only, safe now). Current grants to PostgREST roles.
-- ---------------------------------------------------------------------------
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
                     'inventory_month_summary','inventory_month_snapshots',
                     'inventory_audit_log','role_page_access')
  AND grantee IN ('anon','authenticated','service_role')
ORDER BY table_name, grantee, privilege_type;
-- EXPECT TODAY: anon/authenticated/service_role each have broad grants —
-- this is the vulnerability. EXPECT AFTER C3: no `anon` rows at all.

-- C2. INSPECTION (read-only, safe now). Permissive policies that make anon
--     reads/writes pass RLS even when grants exist.
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('inventory_purchases','inventory_counts','inventory_items',
                    'inventory_month_summary','inventory_month_snapshots',
                    'inventory_audit_log','role_page_access')
ORDER BY tablename, policyname;
-- EXPECT TODAY: *_public_all policies with qual/with_check = true.
-- EXPECT AFTER C3: none of these policy names remain.


-- ===========================================================================
-- C3. THE SECURITY CHANGE — *** COMMENTED OUT: DO NOT RUN YET. ***
--     Uncomment only when every prerequisite checkbox above is satisfied.
-- ===========================================================================

-- C3.1 Remove anon table privileges (PostgREST layer of the defense).
-- REVOKE ALL ON TABLE inventory_purchases     FROM anon;
-- REVOKE ALL ON TABLE inventory_counts        FROM anon;
-- REVOKE ALL ON TABLE inventory_items         FROM anon;
-- REVOKE ALL ON TABLE inventory_month_summary FROM anon;
-- REVOKE ALL ON TABLE inventory_month_snapshots FROM anon;
-- REVOKE ALL ON TABLE inventory_audit_log     FROM anon;
-- REVOKE ALL ON TABLE role_page_access        FROM anon;

-- C3.2 Drop the permissive RLS policies (RLS layer of the defense).
-- DROP POLICY IF EXISTS "inv_purch_public_all"           ON inventory_purchases;
-- DROP POLICY IF EXISTS "inventory_counts_public_all"    ON inventory_counts;
-- DROP POLICY IF EXISTS "inventory_items_public_all"     ON inventory_items;
-- DROP POLICY IF EXISTS "inventory_month_summary_public_all" ON inventory_month_summary;
-- DROP POLICY IF EXISTS "ims_public_all"                 ON inventory_month_snapshots;
-- DROP POLICY IF EXISTS "ial_public_all"                 ON inventory_audit_log;
-- DROP POLICY IF EXISTS "rpa_public_all"                 ON role_page_access;

-- C3.3 Document service_role-only intent (service_role bypasses RLS anyway;
--      these policies make the intent auditable in pg_policies).
-- CREATE POLICY "inv_purch_service_only"  ON inventory_purchases     FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "inv_count_service_only"  ON inventory_counts        FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "inv_items_service_only"  ON inventory_items         FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "inv_summary_service_only" ON inventory_month_summary FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "ims_service_only"        ON inventory_month_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "ial_service_only"        ON inventory_audit_log     FOR ALL TO service_role USING (true) WITH CHECK (true);
-- CREATE POLICY "rpa_service_only"        ON role_page_access        FOR ALL TO service_role USING (true) WITH CHECK (true);

-- C3.4 Ensure service_role keeps full table access (runs harmlessly if the
--      default grants already exist).
-- GRANT ALL ON TABLE inventory_purchases     TO service_role;
-- GRANT ALL ON TABLE inventory_counts        TO service_role;
-- GRANT ALL ON TABLE inventory_items         TO service_role;
-- GRANT ALL ON TABLE inventory_month_summary TO service_role;
-- GRANT ALL ON TABLE inventory_month_snapshots TO service_role;
-- GRANT ALL ON TABLE inventory_audit_log     TO service_role;
-- GRANT ALL ON TABLE role_page_access        TO service_role;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ===========================================================================
-- C4. POST-C3 VERIFICATION (run AFTER uncommenting and executing C3).
--     This stage is only "done" when the DIRECT anon REST probes fail.
-- ===========================================================================

-- C4.1 Catalog checks.
-- SELECT table_name, grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema='public'
--   AND table_name IN ('inventory_purchases','inventory_counts','inventory_items',
--                      'inventory_month_summary','inventory_month_snapshots',
--                      'inventory_audit_log','role_page_access')
--   AND grantee='anon';
-- EXPECT: 0 rows.

-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname='public' AND policyname LIKE '%_public_all';
-- EXPECT: 0 rows.

-- C4.2 DIRECT ANON REST PROBES — run with curl from a terminal (NOT SQL
--      Editor), using the anon key from the dashboard. Both must fail:
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     "$SUPABASE_URL/rest/v1/inventory_purchases?select=*&limit=1" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--   EXPECT: 401 or 403 (today this returns 200 with data — the vulnerability).
--
--   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
--     "$SUPABASE_URL/rest/v1/inventory_purchases" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     -H "Content-Type: application/json" \
--     -H "Prefer: return=minimal" \
--     -d '{"count_month":"1900-01","purchase_date":"1900-01-01","type":"local","description":"probe","amount":0}'
--   EXPECT: 401 or 403 (today this inserts — verify any row created by a
--   probe is deleted, and never probe with real customer data).
--
-- Do NOT mark Stage C complete on the catalog checks alone.
