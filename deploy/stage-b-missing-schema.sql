-- ===========================================================================
-- STAGE B — MISSING INVENTORY SCHEMA  (repository steps 25 + 26)
-- Creates ONLY the two missing tables:
--   25  inventory_month_snapshots  (supabase/schema-inventory-snapshots.sql)
--   26  inventory_audit_log        (supabase/schema-inventory-audit.sql)
--
-- PREREQUISITES (see deploy/README.md — do not run until all are true):
--   * Stage A preflight reviewed and shows these two tables ABSENT
--     (or, if present, matching the expected columns below).
--   * A Supabase backup/restore point exists (Dashboard → Database → Backups).
--   * The repo checkout is exactly the reviewed commit.
--
-- SAFETY PROPERTIES:
--   * No DROP, no TRUNCATE, no ALTER of any EXISTING table. Existing
--     inventory/purchase rows are untouched (these are brand-new tables).
--   * All statements are idempotent (CREATE TABLE/INDEX IF NOT EXISTS,
--     DROP POLICY IF EXISTS + CREATE POLICY) — safe to re-run after a failure.
--   * A compatibility guard runs FIRST: if a target table already exists but
--     does NOT match the repository definition, the script ABORTS loudly
--     instead of silently accepting an incompatible schema.
--   * Supabase SQL Editor wraps this in a single implicit transaction; the
--     explicit BEGIN/COMMIT keeps it correct if run via psql too.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- B0. Compatibility guard. Aborts the transaction on any mismatch, so the
--     CREATE TABLE IF NOT EXISTS statements below can never silently skip a
--     table that exists with the wrong shape.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r          RECORD;
  actual_ty  TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- inventory_month_snapshots (step 25)
      ('inventory_month_snapshots','count_month',      'text'),
      ('inventory_month_snapshots','opening_value',    'numeric(12,2)'),
      ('inventory_month_snapshots','closing_value',    'numeric(12,2)'),
      ('inventory_month_snapshots','purchases',        'numeric(12,2)'),
      ('inventory_month_snapshots','sales',            'numeric(12,2)'),
      ('inventory_month_snapshots','cogs',             'numeric(12,2)'),
      ('inventory_month_snapshots','food_cost_pct',    'numeric(6,2)'),
      ('inventory_month_snapshots','status',           'text'),
      ('inventory_month_snapshots','finalized_by',     'text'),
      ('inventory_month_snapshots','finalized_at',     'timestamp with time zone'),
      ('inventory_month_snapshots','reopened_by',      'text'),
      ('inventory_month_snapshots','reopened_at',      'timestamp with time zone'),
      ('inventory_month_snapshots','reopen_reason',    'text'),
      ('inventory_month_snapshots','version',          'integer'),
      ('inventory_month_snapshots','created_at',       'timestamp with time zone'),
      -- inventory_audit_log (step 26)
      ('inventory_audit_log','id',           'bigint'),
      ('inventory_audit_log','count_month',  'text'),
      ('inventory_audit_log','action',       'text'),
      ('inventory_audit_log','actor',        'text'),
      ('inventory_audit_log','reason',       'text'),
      ('inventory_audit_log','snapshot',     'jsonb'),
      ('inventory_audit_log','version',      'integer'),
      ('inventory_audit_log','created_at',   'timestamp with time zone')
  ) AS expect(tbl, col, ty)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      CONTINUE; -- absent: the CREATE TABLE below will build it correctly
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
      INTO actual_ty
    FROM pg_attribute a
    WHERE a.attrelid = ('public.' || r.tbl)::regclass
      AND a.attname = r.col
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF actual_ty IS NULL THEN
      RAISE EXCEPTION
        'STAGE B ABORT: table % exists but is missing column %. It does not match '
        'the repository definition (supabase/schema-inventory-snapshots.sql / '
        '-audit.sql). Fix the divergence manually — do not force this script.',
        r.tbl, r.col;
    END IF;

    -- Prefix match so numeric(12,2) accepts the exact declared precision but
    -- rejects a different one (e.g. numeric(6,2) vs numeric(12,2)).
    IF actual_ty <> r.ty AND actual_ty NOT LIKE r.ty || '(%' THEN
      RAISE EXCEPTION
        'STAGE B ABORT: %.% has type %, expected %. Divergent schema — '
        'reconcile manually before running Stage B.',
        r.tbl, r.col, actual_ty, r.ty;
    END IF;
  END LOOP;

  RAISE NOTICE 'Stage B guard passed: no incompatible target objects found.';
END $$;

-- ---------------------------------------------------------------------------
-- B1. Step 25 — VERBATIM copy of supabase/schema-inventory-snapshots.sql.
-- ---------------------------------------------------------------------------
-- Month-end accounting snapshots — one row per month, keyed by month. A row is
-- written ONLY by the server-side finalize API (never from the browser) and is
-- never deleted: reopening flips `status` back to 'draft' and records who/why,
-- so the original finalized figures stay on file for audit and re-correction.
-- Run AFTER schema-month-end-inventory.sql + schema-inventory-summary.sql.
-- Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS inventory_month_snapshots (
  count_month TEXT PRIMARY KEY,                -- 'YYYY-MM'
  opening_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  purchases NUMERIC(12,2) NOT NULL DEFAULT 0,
  sales NUMERIC(12,2),                         -- NULL = food sales not entered
  cogs NUMERIC(12,2),
  food_cost_pct NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'finalized' CHECK (status IN ('finalized','draft')),
  finalized_by TEXT,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reopened_by TEXT,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,           -- bumped on every re-finalize
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SECURITY NOTE (residual exposure): BTB authenticates via a cookie, not a
-- Supabase session, and no service-role key is available to the API routes, so
-- RLS cannot be bound to a per-user identity without inventing a mapping that
-- does not exist. Reads are open; writes are intended to go only through the
-- authorized server routes (/api/btb/inventory-*). Direct anon writes to this
-- table remain technically possible and are a KNOWN, DOCUMENTED limitation —
-- tighten here once a Supabase identity for BTB users (or a service-role key
-- for the routes) exists.
ALTER TABLE inventory_month_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ims_public_all" ON inventory_month_snapshots;
CREATE POLICY "ims_public_all" ON inventory_month_snapshots FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- B2. Step 26 — VERBATIM copy of supabase/schema-inventory-audit.sql.
-- ---------------------------------------------------------------------------
-- Inventory audit trail — one row per protected action (finalize, reopen,
-- correction). Stores a JSONB copy of the figures at the moment of the action
-- so a finalized snapshot is never lost even after a reopen/correction cycle.
-- Run AFTER schema-inventory-snapshots.sql. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS inventory_audit_log (
  id BIGSERIAL PRIMARY KEY,
  count_month TEXT NOT NULL,
  action TEXT NOT NULL,                        -- finalize | reopen | correct
  actor TEXT,                                  -- role that performed the action
  reason TEXT,                                 -- required for reopen/correct
  snapshot JSONB,                              -- the figures at action time
  version INTEGER,                             -- snapshot version referenced
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ial_public_all" ON inventory_audit_log;
-- Append-only from the server routes; reads open (BTB tablets have no session).
CREATE POLICY "ial_public_all" ON inventory_audit_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_audit_month ON inventory_audit_log(count_month, created_at DESC);

COMMIT;

-- ===========================================================================
-- B3. VERIFICATION — run after B0–B2. Every query must succeed and the
--     expected results are listed in deploy/README.md.
-- ===========================================================================

-- B3.1 Both tables exist.
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY 1;
-- EXPECT: 2 rows — inventory_audit_log, inventory_month_snapshots.

-- B3.2 Snapshots columns match the repository definition (expect 15 rows).
SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='inventory_month_snapshots'
ORDER BY ordinal_position;
-- EXPECT: count_month(text,PK) … version(integer, not null, default 1),
--         created_at(timestamptz, not null, default now()) — 15 columns.

-- B3.3 Audit columns match (expect 8 rows).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='inventory_audit_log'
ORDER BY ordinal_position;
-- EXPECT: id(bigint,PK,sequence default), count_month/action NOT NULL,
--         actor/reason/snapshot/version nullable, created_at default now().

-- B3.4 Primary keys and the status CHECK constraint.
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE connamespace='public'::regnamespace
  AND conrelid::regclass::text IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY 1,2;
-- EXPECT: 2 primary keys + 1 CHECK (status = ANY (ARRAY['finalized','draft'])).

-- B3.5 The audit index exists.
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='inventory_audit_log';
-- EXPECT: inventory_audit_log_pkey, idx_inv_audit_month.

-- B3.6 RLS is enabled and the two permissive policies exist.
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('inventory_month_snapshots','inventory_audit_log');
-- EXPECT: both rows with relrowsecurity = true.

SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('inventory_month_snapshots','inventory_audit_log')
ORDER BY 1,2;
-- EXPECT: ims_public_all, ial_public_all.

-- B3.7 Existing data untouched — row counts identical to Stage A section A8.
SELECT 'inventory_purchases' AS table_name, count(*) AS row_count FROM inventory_purchases
UNION ALL SELECT 'inventory_counts',       count(*) FROM inventory_counts
UNION ALL SELECT 'inventory_items',        count(*) FROM inventory_items
UNION ALL SELECT 'inventory_month_summary',count(*) FROM inventory_month_summary
UNION ALL SELECT 'role_page_access',       count(*) FROM role_page_access
ORDER BY 1;
-- EXPECT: identical to the Stage A counts.

-- B3.8 New tables are empty (no probe/demo data).
SELECT 'inventory_month_snapshots' AS table_name, count(*) AS row_count FROM inventory_month_snapshots
UNION ALL SELECT 'inventory_audit_log', count(*) FROM inventory_audit_log;
-- EXPECT: 0, 0.

SELECT 'STAGE B VERIFICATION COMPLETE' AS result;
