-- Step 48: optional photo evidence on an off-form temperature reading.
BEGIN;
ALTER TABLE public.temperature_records ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.temperature_records DROP CONSTRAINT IF EXISTS temperature_records_photo_url_length;
ALTER TABLE public.temperature_records ADD CONSTRAINT temperature_records_photo_url_length CHECK (photo_url IS NULL OR length(photo_url) <= 1000);
COMMIT;
