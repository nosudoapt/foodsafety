-- Operational feature tables (re-landed from 26d5020, trimmed).
-- Run AFTER schema.sql, schema-rbac.sql, schema-roles.sql.
-- BTB staff pages are public (shared tablets), so prep/order/cleaning
-- allow anon access. ponytail: demo-grade; scope to per-restaurant auth
-- later via a restaurant_id claim.

-- Daily prep count: MAKE = PAR - ON_HAND (computed in the app). 7-day view.
CREATE TABLE IF NOT EXISTS prep_counts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  item_name TEXT NOT NULL,
  par NUMERIC NOT NULL DEFAULT 0,
  on_hand NUMERIC NOT NULL DEFAULT 0,
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order sheet: ORDER = PAR - ON_HAND. Keep 3 months of records.
CREATE TABLE IF NOT EXISTS order_sheets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  item_name TEXT NOT NULL,
  par NUMERIC NOT NULL DEFAULT 0,
  on_hand NUMERIC NOT NULL DEFAULT 0,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cleaning schedule log with before/after photos.
CREATE TABLE IF NOT EXISTS cleaning_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  task_name TEXT NOT NULL,
  done_by TEXT,
  before_photo TEXT,
  after_photo TEXT,
  done_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prep_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_logs ENABLE ROW LEVEL SECURITY;

-- Public operational access for shared tablets.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['prep_counts','order_sheets','cleaning_logs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_public_all" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "%s_public_all" ON %I FOR ALL USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END $$;

-- Purge records past their retention window (call from a scheduled job).
CREATE OR REPLACE FUNCTION public.purge_expired_operational()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM prep_counts  WHERE count_date < CURRENT_DATE - INTERVAL '7 days';
  DELETE FROM order_sheets WHERE order_date < CURRENT_DATE - INTERVAL '3 months';
  -- Temperature records keep a 90-day rolling window.
  DELETE FROM temperature_records WHERE recorded_at < NOW() - INTERVAL '90 days';
$$;

CREATE INDEX IF NOT EXISTS idx_prep_counts_date ON prep_counts(count_date);
CREATE INDEX IF NOT EXISTS idx_order_sheets_date ON order_sheets(order_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_logs_date ON cleaning_logs(done_date);
