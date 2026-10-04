-- Month-End Inventory — the counted item list plus one row per item per
-- month, so closing value and month-over-month variance can be compared.
-- Step 20. Run AFTER schema-locations.sql (step 11) — needs `locations`.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL, -- NULL = company-wide list
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ea',          -- ea | kg | L | bag | box …
  category TEXT,                            -- free text: Dry, Fridge, Freezer, Cleaning…
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  -- Month key the count belongs to: 'YYYY-MM' (the month being closed).
  count_month TEXT NOT NULL,
  qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, count_month, location_id)
);

-- Shared tablets are cookie-authed with no Supabase session: demo-grade public
-- policies, same as the other BTB operational tables (schema-features.sql).
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_items_public_all" ON inventory_items;
CREATE POLICY "inventory_items_public_all" ON inventory_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "inventory_counts_public_all" ON inventory_counts;
CREATE POLICY "inventory_counts_public_all" ON inventory_counts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inventory_items_location ON inventory_items(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_month   ON inventory_counts(count_month);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_item    ON inventory_counts(item_id);

-- Retention: keep two closing years on hand (enough for YoY variance), drop
-- the rest with a scheduled job (pg_cron) or by hand:
--   SELECT purge_inventory_counts();
CREATE OR REPLACE FUNCTION public.purge_inventory_counts()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM inventory_counts
  WHERE count_month < to_char(CURRENT_DATE - INTERVAL '24 months', 'YYYY-MM');
$$;
