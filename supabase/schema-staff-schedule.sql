-- Online Staff Schedule — who works when (90-day retention on shifts).
-- Step 17. Run AFTER schema-locations.sql (step 11) — needs `locations`.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS staff_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  position TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_shifts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  staff_member_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- TEXT "HH:MM" (24h) straight out of <input type="time"> — no timezone maths.
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '17:00',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared tablets are cookie-authed with no Supabase session: demo-grade public
-- policies, same as the other BTB operational tables (schema-features.sql).
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_members_public_all" ON staff_members;
CREATE POLICY "staff_members_public_all" ON staff_members FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "staff_shifts_public_all" ON staff_shifts;
CREATE POLICY "staff_shifts_public_all" ON staff_shifts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_staff_members_location ON staff_members(location_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_location  ON staff_shifts(location_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_date      ON staff_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_member    ON staff_shifts(staff_member_id);

-- Retention: the calendar reads a rolling window; old shifts are purged by a
-- scheduled job (pg_cron) or by hand:  SELECT purge_staff_schedule();
-- Roster rows themselves are kept — only posted shifts age out.
CREATE OR REPLACE FUNCTION public.purge_staff_schedule()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM staff_shifts WHERE shift_date < CURRENT_DATE - INTERVAL '90 days';
$$;
