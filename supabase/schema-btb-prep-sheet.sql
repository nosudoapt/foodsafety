-- Release 10: the prep sheet becomes a per-branch, per-person workflow.
--
-- Managers set the week's PAR levels and assign each section (Produce,
-- Starches, Sauces, Meats, Freezer pull, Dairy) to one or more staff. Staff see
-- only their own sections, never PAR, tick DONE, and their typing is saved as a
-- draft before they submit. Everything is stamped with the branch.
BEGIN;

-- 1. Rows gain the section, the unit, the DONE tick and the "ad-hoc" marker.
ALTER TABLE public.prep_counts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.prep_counts ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.prep_counts ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false;
ALTER TABLE public.prep_counts ADD COLUMN IF NOT EXISTS custom boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS prep_counts_location_day ON public.prep_counts(location_id, count_date DESC);

-- 2. "PAR levels are set for this week" — one marker per branch and area.
CREATE TABLE IF NOT EXISTS public.btb_par_weeks (
  location_id uuid NOT NULL REFERENCES public.locations(id),
  area text NOT NULL CHECK (area IN ('prep','order')),
  week_start date NOT NULL,
  set_by uuid,
  set_by_name text NOT NULL DEFAULT '',
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, area, week_start)
);

-- 3. The PAR levels themselves, for the seven days that start on week_start.
CREATE TABLE IF NOT EXISTS public.btb_prep_par_levels (
  location_id uuid NOT NULL REFERENCES public.locations(id),
  week_start date NOT NULL,
  item_key text NOT NULL CHECK (length(btrim(item_key)) BETWEEN 1 AND 160),
  item_name text NOT NULL CHECK (length(btrim(item_name)) BETWEEN 1 AND 160),
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
  unit text NOT NULL DEFAULT '',
  par numeric(12,2) NOT NULL DEFAULT 0 CHECK (par >= 0),
  urgent boolean NOT NULL DEFAULT false,
  custom boolean NOT NULL DEFAULT false,
  set_by uuid,
  set_by_name text NOT NULL DEFAULT '',
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, week_start, item_key)
);

-- 4. Who owns which section this week. Several people may share a section.
CREATE TABLE IF NOT EXISTS public.btb_prep_assignments (
  location_id uuid NOT NULL REFERENCES public.locations(id),
  week_start date NOT NULL,
  category text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, week_start, category, employee_id)
);

-- 5. Autosave: whatever a person has typed, before they submit.
CREATE TABLE IF NOT EXISTS public.btb_prep_drafts (
  location_id uuid NOT NULL REFERENCES public.locations(id),
  count_date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  category text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, count_date, employee_id, category)
);

-- 6. A submission, complete or partial, is what the manager is notified about.
CREATE TABLE IF NOT EXISTS public.btb_prep_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  count_date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  employee_name text NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  complete boolean NOT NULL,
  missing integer NOT NULL DEFAULT 0 CHECK (missing >= 0),
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_prep_submissions_day ON public.btb_prep_submissions(location_id, count_date DESC);

-- 7. Comments belong to the day and are readable by the whole branch.
CREATE TABLE IF NOT EXISTS public.btb_prep_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  count_date date NOT NULL,
  author_employee_id uuid,
  author_name text NOT NULL,
  author_role text NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_prep_comments_day ON public.btb_prep_comments(location_id, count_date, created_at);

-- 8. In-app notifications (no email) for managers when someone submits.
CREATE TABLE IF NOT EXISTS public.btb_prep_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  kind text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS btb_prep_events_unread ON public.btb_prep_events(location_id, created_at DESC) WHERE read_at IS NULL;

-- 9. Server-only: the browser never touches these tables directly.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_par_weeks','btb_prep_par_levels','btb_prep_assignments',
    'btb_prep_drafts','btb_prep_submissions','btb_prep_comments','btb_prep_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tab);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
