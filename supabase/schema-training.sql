-- Training Guide — kitchen SOPs, onboarding modules and their sections.
-- Step 19. Run AFTER schema-locations.sql (step 11) — needs `locations`.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS training_topics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL, -- NULL = every site
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'food_safety', -- food_safety | cleaning | equipment | service | safety
  est_minutes INT NOT NULL DEFAULT 5,
  published BOOLEAN NOT NULL DEFAULT false,    -- staff only ever see published topics
  position INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_sections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES training_topics(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  heading TEXT NOT NULL,
  -- Body is plain text: paragraphs on blank lines, "- " lines become checklist bullets.
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared tablets are cookie-authed with no Supabase session: demo-grade public
-- policies, same as the other BTB operational tables (schema-features.sql).
ALTER TABLE training_topics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_topics_public_all" ON training_topics;
CREATE POLICY "training_topics_public_all" ON training_topics FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "training_sections_public_all" ON training_sections;
CREATE POLICY "training_sections_public_all" ON training_sections FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_training_topics_location ON training_topics(location_id);
CREATE INDEX IF NOT EXISTS idx_training_sections_topic  ON training_sections(topic_id);

-- The guide is reference material that only grows (no PII, no turnover), so
-- there is no purge function for these tables.
