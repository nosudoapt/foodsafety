-- Platform admin: usage activity tracking + client plans (step 30).
-- Powers the owner-tier platform dashboard (/admin/platform): heatmap,
-- recently/most used links, per-client storage & usage, pricing.

-- One row per page visit (both products: Supabase-authed FoodSafe users and
-- BTB cookie sessions). Written by /api/activity with server-side identity —
-- the client only sends the path, never a name.
CREATE TABLE IF NOT EXISTS app_activity (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','btb')),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  restaurant_name TEXT NOT NULL DEFAULT '',
  location_id UUID,
  path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_activity_actor ON app_activity(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_activity_created ON app_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_activity_restaurant ON app_activity(restaurant_name, created_at DESC);

-- Billing / pricing game: one row per client (restaurant). Written by the
-- owner from the platform dashboard.
CREATE TABLE IF NOT EXISTS platform_plans (
  restaurant_name TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'standard',
  seats INTEGER NOT NULL DEFAULT 0,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform-owner passcode: a single row, SHA-256 hash only. The /platform
-- sign-in reads it through the service-role server client; no policies means
-- anon/authenticated roles can never touch it. First sign-in claims the row.
CREATE TABLE IF NOT EXISTS platform_auth (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  passcode_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;

-- Insert: any signed-in FoodSafe user or valid BTB session posts via the API;
-- the API verifies identity, but the row write itself is open to the two app
-- paths the server uses (service role bypasses RLS; this keeps direct browser
-- inserts working for the anon-key path too).
DROP POLICY IF EXISTS "app_activity_insert" ON app_activity;
CREATE POLICY "app_activity_insert" ON app_activity FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Read: your own activity, or the owner tier (platform dashboard).
DROP POLICY IF EXISTS "app_activity_read" ON app_activity;
CREATE POLICY "app_activity_read" ON app_activity FOR SELECT
  TO authenticated
  USING (
    actor_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','multi_location_owner','corporate'))
  );

DROP POLICY IF EXISTS "platform_plans_read" ON platform_plans;
CREATE POLICY "platform_plans_read" ON platform_plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "platform_plans_owner_write" ON platform_plans;
CREATE POLICY "platform_plans_owner_write" ON platform_plans FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','multi_location_owner','corporate')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','multi_location_owner','corporate')));

NOTIFY pgrst,'reload schema';
