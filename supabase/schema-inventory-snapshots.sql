CREATE TABLE IF NOT EXISTS inventory_month_snapshots (
  count_month TEXT PRIMARY KEY,
  opening_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  purchases NUMERIC(12,2) NOT NULL DEFAULT 0,
  sales NUMERIC(12,2),
  cogs NUMERIC(12,2),
  food_cost_pct NUMERIC(6,2),
  finalized_by TEXT,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE inventory_month_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ims_public_all" ON inventory_month_snapshots;
CREATE POLICY "ims_public_all" ON inventory_month_snapshots FOR ALL USING (true) WITH CHECK (true);
