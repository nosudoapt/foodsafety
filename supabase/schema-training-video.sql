-- Training videos — one optional video per topic (YouTube link or mp4 URL).
-- Run AFTER supabase/schema-training.sql. Idempotent: safe to re-run.
ALTER TABLE training_topics ADD COLUMN IF NOT EXISTS video_url TEXT;
