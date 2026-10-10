-- Opening & Closing checklists — own box outside the Daily Prep Sheet, with history.
-- Run AFTER schema.sql, schema-roles.sql. Same public-tablet model as
-- prep_counts / order_sheets / cleaning_logs (see schema-features.sql).
CREATE TABLE IF NOT EXISTS btb_checklists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  check_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_type TEXT NOT NULL CHECK (check_type IN ('opening','closing')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  done_count INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  location_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (check_date, check_type, location_id)
);

ALTER TABLE btb_checklists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "btb_checklists_public_all" ON btb_checklists;
  CREATE POLICY "btb_checklists_public_all" ON btb_checklists FOR ALL USING (true) WITH CHECK (true);
END $$;

CREATE INDEX IF NOT EXISTS idx_btb_checklists_date ON btb_checklists(check_date DESC);
