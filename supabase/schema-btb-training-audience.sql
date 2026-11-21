-- Step 38: training modules can target the whole team or managers only.
-- Week 4 manager training is owner-approved; the audience column is what the
-- API/UI use to hide it from staff and route the review to an owner.
BEGIN;

DO $$ BEGIN
  IF to_regclass('public.training_topics') IS NULL THEN
    RAISE EXCEPTION 'Install the training release (step 19) before step 38' USING ERRCODE='42P01';
  END IF;
END $$;

ALTER TABLE public.training_topics ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff';
ALTER TABLE public.training_topics DROP CONSTRAINT IF EXISTS training_topics_audience_check;
ALTER TABLE public.training_topics ADD CONSTRAINT training_topics_audience_check CHECK (audience IN ('staff','manager'));

GRANT SELECT,INSERT,UPDATE ON public.training_topics TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
