-- Cleaning schedule → Supabase (localStorage removal).
-- Run AFTER schema-features.sql (creates cleaning_logs). Idempotent.

-- Time the task was completed (HH:MM from the card's Time input).
ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS done_time TEXT;

-- Monday of the week the entry belongs to; lets one week share a stable key
-- instead of guessing from done_date (which the UI lets fall outside the week).
ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS week_start DATE;
CREATE INDEX IF NOT EXISTS idx_cleaning_logs_week ON cleaning_logs(week_start);

-- Compressed before/after photos live in this Storage bucket; the before_photo /
-- after_photo TEXT columns hold JSON arrays of object paths so each task can
-- carry several angles without bloating Postgres.
-- Demo-grade public bucket (public read URL, anon write scoped to the bucket) —
-- matches the public RLS on cleaning_logs for shared tablets.
-- NOT production access control.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ops-photos', 'ops-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ops_photos_select" ON storage.objects;
CREATE POLICY "ops_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'ops-photos');

DROP POLICY IF EXISTS "ops_photos_insert" ON storage.objects;
CREATE POLICY "ops_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ops-photos');

DROP POLICY IF EXISTS "ops_photos_update" ON storage.objects;
CREATE POLICY "ops_photos_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'ops-photos') WITH CHECK (bucket_id = 'ops-photos');

DROP POLICY IF EXISTS "ops_photos_delete" ON storage.objects;
CREATE POLICY "ops_photos_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'ops-photos');
