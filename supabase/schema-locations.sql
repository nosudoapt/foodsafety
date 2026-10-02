-- Locations model (multi-location owners, real dashboard counts).
-- Run AFTER schema.sql, schema-rbac.sql, schema-roles.sql, schema-features.sql,
-- schema-compliance.sql. Idempotent (safe to re-run).
--
-- Shape:
--   locations            one row per site (id, name, address, created_at)
--   profiles.location_id the profile's HOME site (its foreign key)
--   location_members     who may switch to which site — a multi-location owner
--                        is a member of every site, everyone else of their own
--   <table>.location_id  the site a row belongs to, so reads/writes can be
--                        scoped by the active location in the app
--
-- Rows written with no active location (shared store tablet, no Supabase
-- session) keep location_id NULL and are visible from every site — see
-- src/contexts/AuthContext.tsx.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- The site a profile belongs to. ON DELETE SET NULL = losing a site never
-- deletes the person (they fall back to the default site in AuthContext).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(location_id);

CREATE TABLE IF NOT EXISTS location_members (
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (location_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2. location_id on the tables the app scopes by site
--    - operational tables (prep / order / cleaning) — the BTB surfaces
--    - the three tables behind the dashboard counters (expiry, temp alerts,
--      open actions), so those counts are per-site rather than cosmetic
-- ---------------------------------------------------------------------------
ALTER TABLE prep_counts           ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE order_sheets          ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
-- `urgent` is the manager's flag on a PAR line (prep sheet + order sheet);
-- it rides in this migration because those two tables are already being
-- altered here. See src/lib/par-prefill.ts.
ALTER TABLE prep_counts           ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE order_sheets          ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cleaning_logs         ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE compliance_documents  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE temperature_records   ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE corrective_actions    ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prep_counts_location      ON prep_counts(location_id);
CREATE INDEX IF NOT EXISTS idx_order_sheets_location     ON order_sheets(location_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_logs_location    ON cleaning_logs(location_id);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_location  ON compliance_documents(location_id);
CREATE INDEX IF NOT EXISTS idx_temperature_location      ON temperature_records(location_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_location ON corrective_actions(location_id);

-- ---------------------------------------------------------------------------
-- 3. Seed sites. Fixed ids + explicit created_at so "the default site" (first
--    by created_at) is deterministic on every re-run.
-- ---------------------------------------------------------------------------
INSERT INTO locations (id, name, address, created_at) VALUES
  ('10000000-0000-4000-8000-000000000001', 'The Grill House', '12 High Street, Manchester M1 1AA', '2026-01-01T09:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', 'Piccadilly',      '48 Piccadilly, Manchester M1 1LS',   '2026-01-02T09:00:00Z'),
  ('10000000-0000-4000-8000-000000000003', 'Deansgate',       '210 Deansgate, Manchester M3 3NW',    '2026-01-03T09:00:00Z'),
  ('10000000-0000-4000-8000-000000000004', 'Ancoats',         '7 Redhill Street, Manchester M4 5BA', '2026-01-04T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Backfill. Existing profiles take the site whose name matches their
--    restaurant_name, otherwise the default site; everyone becomes a member of
--    their own site, and owner-tier roles are members of all of them.
-- ---------------------------------------------------------------------------
UPDATE profiles p
SET location_id = COALESCE(
  (SELECT l.id FROM locations l WHERE l.name = p.restaurant_name ORDER BY l.created_at LIMIT 1),
  (SELECT id FROM locations ORDER BY created_at, id LIMIT 1)
)
WHERE p.location_id IS NULL;

INSERT INTO location_members (location_id, user_id)
SELECT p.location_id, p.id FROM profiles p WHERE p.location_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Owner-tier roles that genuinely run the group are members of every site; a
-- single-site `owner` stays a member of their home site only (their home row
-- is already covered by the statement above).
INSERT INTO location_members (location_id, user_id)
SELECT l.id, p.id
FROM locations l
JOIN profiles p ON p.role IN ('multi_location_owner', 'corporate')
ON CONFLICT DO NOTHING;

-- Pre-existing rows belong to the default site until they say otherwise.
DO $$
DECLARE d UUID;
DECLARE t TEXT;
BEGIN
  SELECT id INTO d FROM locations ORDER BY created_at, id LIMIT 1;
  IF d IS NULL THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['prep_counts','order_sheets','cleaning_logs',
                           'compliance_documents','temperature_records','corrective_actions'] LOOP
    EXECUTE format('UPDATE %I SET location_id = $1 WHERE location_id IS NULL;', t) USING d;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4b. Daily PAR sheets carry an urgent flag — checkbox on the prep + order
--     pages, prefilled from the most recent same-weekday count (src/lib/par-prefill.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE prep_counts  ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE order_sheets ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 5. RLS. Read is authenticated-only (the dashboard switcher lists sites);
--    writes need the management tier, matching the other admin tables.
--    The BTB tablet surfaces hold no Supabase session, so they never resolve a
--    location and simply read every row.
-- ---------------------------------------------------------------------------
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_auth_read" ON locations;
CREATE POLICY "locations_auth_read" ON locations
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "locations_mgmt_write" ON locations;
CREATE POLICY "locations_mgmt_write" ON locations
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role IN ('owner','multi_location_owner','corporate','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role IN ('owner','multi_location_owner','corporate','manager')));

DROP POLICY IF EXISTS "location_members_auth_read" ON location_members;
CREATE POLICY "location_members_auth_read" ON location_members
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "location_members_mgmt_write" ON location_members;
CREATE POLICY "location_members_mgmt_write" ON location_members
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role IN ('owner','multi_location_owner','corporate','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role IN ('owner','multi_location_owner','corporate','manager')));
