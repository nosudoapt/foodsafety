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
