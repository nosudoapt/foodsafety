-- Cash Out — end-of-day till reconciliation (30-day retention).
-- Step 16. Run AFTER schema-locations.sql (step 11) — needs `locations`.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS cash_outs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  till_amount   NUMERIC NOT NULL DEFAULT 0,
  cash_sale     NUMERIC NOT NULL DEFAULT 0,
  delivery_fees NUMERIC NOT NULL DEFAULT 0,
  driver_tips   NUMERIC NOT NULL DEFAULT 0,
  cash_out      NUMERIC NOT NULL DEFAULT 0,
  safe_drop     NUMERIC NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BTB tablets are cookie-authed with no Supabase session — same demo-grade
-- public policy the operational tables use (see schema-features.sql).
ALTER TABLE cash_outs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cash_outs_public_all" ON cash_outs;
CREATE POLICY "cash_outs_public_all" ON cash_outs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cash_outs_date      ON cash_outs(count_date);
CREATE INDEX IF NOT EXISTS idx_cash_outs_location  ON cash_outs(location_id);

-- Retention: the page only reads the last 30 days; this purges the rest.
-- Call it from a scheduled job (pg_cron) or by hand:
--   SELECT purge_cash_outs();
CREATE OR REPLACE FUNCTION public.purge_cash_outs()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM cash_outs WHERE count_date < CURRENT_DATE - INTERVAL '30 days';
$$;
