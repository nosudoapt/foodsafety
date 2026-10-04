-- Corporate dates — filing deadlines (GST/HST/PST, payroll remittances,
-- licences, insurance) with the recurrence they repeat on.
-- Step 18. Run AFTER schema-locations.sql (step 11) — needs `locations`.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS corporate_dates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL, -- NULL = company-wide
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'tax',  -- tax | payroll | licence | insurance | other
  due_date DATE NOT NULL,
  -- none | monthly | quarterly | annual — drives the "next due" roll-forward.
  recurrence TEXT NOT NULL DEFAULT 'none',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared tablets are cookie-authed with no Supabase session: demo-grade public
-- policies, same as the other BTB operational tables (schema-features.sql).
ALTER TABLE corporate_dates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "corporate_dates_public_all" ON corporate_dates;
CREATE POLICY "corporate_dates_public_all" ON corporate_dates
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_corporate_dates_location ON corporate_dates(location_id);
CREATE INDEX IF NOT EXISTS idx_corporate_dates_due      ON corporate_dates(due_date);

-- These rows ARE the calendar (a deadline that aged out would silently vanish
-- from next year's view), so there is no purge function for this table.
