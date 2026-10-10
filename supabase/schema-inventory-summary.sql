-- Month math — opening value, purchases and sales per closing month.
-- Closing comes from inventory_counts (the count sheet itself):
--   usage = opening + purchases − closing · food cost % = usage ÷ sales.
-- Run AFTER supabase/schema-month-end-inventory.sql. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS inventory_month_summary (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID,
  count_month TEXT NOT NULL,
  opening_value NUMERIC NOT NULL DEFAULT 0,
  purchases NUMERIC NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (count_month, location_id)
);

ALTER TABLE inventory_month_summary ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "inventory_month_summary_public_all" ON inventory_month_summary;
  CREATE POLICY "inventory_month_summary_public_all" ON inventory_month_summary FOR ALL USING (true) WITH CHECK (true);
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_month_summary_month ON inventory_month_summary(count_month DESC);
