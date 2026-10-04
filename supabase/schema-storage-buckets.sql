-- Storage buckets for the three media types that outgrow ops-photos:
--   cleaning-photos    — future cleaning angles (ops-photos holds today's rows)
--   inspection-photos  — future inspection proofs (same reason)
--   training-videos    — the Training module's uploaded SOP videos
-- Step 22. Idempotent: safe to re-run.
--
-- Existing cleaning / inspection photos keep working: their object paths live
-- in ops-photos (schema-cleaning-photos.sql, step 9) and the app still reads
-- that bucket. New screens pass the bucket explicitly to uploadToSupabase().
-- Demo-grade public buckets — public read, anon write scoped to the bucket —
-- matching the rest of the tablet surface. NOT production access control.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('cleaning-photos',   'cleaning-photos',   true),
  ('inspection-photos', 'inspection-photos', true),
  ('training-videos',   'training-videos',   true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['cleaning-photos', 'inspection-photos', 'training-videos'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects;
       CREATE POLICY %I ON storage.objects
         FOR SELECT USING (bucket_id = %L);',
      b || '_select', b || '_select', b
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects;
       CREATE POLICY %I ON storage.objects
         FOR INSERT WITH CHECK (bucket_id = %L);',
      b || '_insert', b || '_insert', b
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects;
       CREATE POLICY %I ON storage.objects
         FOR UPDATE USING (bucket_id = %L) WITH CHECK (bucket_id = %L);',
      b || '_update', b || '_update', b, b
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects;
       CREATE POLICY %I ON storage.objects
         FOR DELETE USING (bucket_id = %L);',
      b || '_delete', b || '_delete', b
    );
  END LOOP;
END $$;
