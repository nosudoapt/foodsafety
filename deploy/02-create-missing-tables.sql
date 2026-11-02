-- ===========================================================================
-- 02 — CREATE THE MISSING TABLES  (idempotent; preserves all existing rows)
-- Repository steps 25 + 26, verbatim:
--   25  inventory_month_snapshots  (supabase/schema-inventory-snapshots.sql)
--   26  inventory_audit_log        (supabase/schema-inventory-audit.sql)
--
-- Run AFTER 01b-compact-preflight.sql shows both tables ABSENT (or provably
-- compatible). Creates ONLY these two tables — no DROP, no TRUNCATE, no
-- ALTER of any existing table. `role_page_access` (67 rows) and every
-- existing inventory table are untouched. Safe to re-run after a failure.
--
-- Compatibility guard first: if a target table already exists with a
-- divergent column/type, the script ABORTS loudly instead of silently
-- accepting an incompatible schema.
-- ===========================================================================

BEGIN;

-- Guard. Aborts the transaction on any mismatch.
DO $$
DECLARE
  r          RECORD;
  actual_ty  TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
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
      CONTINUE; -- absent: the CREATE TABLE below builds it correctly
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
        'ABORT: table % exists but is missing column %. It does not match the '
        'repository definition — reconcile manually; do not force this script.',
        r.tbl, r.col;
    END IF;

    IF actual_ty <> r.ty AND actual_ty NOT LIKE r.ty || '(%' THEN
      RAISE EXCEPTION
        'ABORT: %.% has type %, expected % — divergent schema, reconcile manually.',
        r.tbl, r.col, actual_ty, r.ty;
    END IF;
  END LOOP;

  RAISE NOTICE 'Guard passed: no incompatible target objects found.';
END $$;

-- --- Step 25, verbatim ------------------------------------------------------
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

-- Residual-exposure note: this permissive policy matches the other inventory
-- tables until deploy/04-security-hardening.sql is run (after the service-role
-- key is configured). It is part of the repository definition, so the applied
-- schema stays equivalent to the migration files for the ledger baseline.
ALTER TABLE inventory_month_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ims_public_all" ON inventory_month_snapshots;
CREATE POLICY "ims_public_all" ON inventory_month_snapshots FOR ALL USING (true) WITH CHECK (true);

-- --- Step 26, verbatim ------------------------------------------------------
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
CREATE POLICY "ial_public_all" ON inventory_audit_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_audit_month ON inventory_audit_log(count_month, created_at DESC);

COMMIT;

SELECT '02 COMPLETE — two tables created (or already present and compatible)' AS result;
