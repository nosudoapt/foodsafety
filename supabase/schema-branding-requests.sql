-- Branding Requests — signage, menu boards, uniforms and packaging artwork
-- requested by a site and worked through by marketing.
-- Step 21. Run AFTER schema-locations.sql (step 11) — needs `locations`.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS branding_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'signage',   -- signage | menu | uniform | packaging | digital | other
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',     -- low | normal | high | urgent
  -- open → in_review → in_progress → done (or declined at any point).
  status TEXT NOT NULL DEFAULT 'open',
  requested_by TEXT,
  due_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared tablets are cookie-authed with no Supabase session: demo-grade public
-- policies, same as the other BTB operational tables (schema-features.sql).
ALTER TABLE branding_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branding_requests_public_all" ON branding_requests;
CREATE POLICY "branding_requests_public_all" ON branding_requests
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_branding_requests_location ON branding_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_branding_requests_status   ON branding_requests(status);
CREATE INDEX IF NOT EXISTS idx_branding_requests_created  ON branding_requests(created_at);

-- Retention: open work is never purged; only finished requests older than two
-- years age out (scheduled pg_cron job or by hand):
--   SELECT purge_branding_requests();
CREATE OR REPLACE FUNCTION public.purge_branding_requests()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM branding_requests
  WHERE status IN ('done', 'declined')
    AND updated_at < NOW() - INTERVAL '24 months';
$$;
