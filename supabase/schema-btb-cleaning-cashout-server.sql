-- Release 12, step 56: the cleaning schedule and the cash-out till count move
-- behind server endpoints. The tables keep their history; what changes is that
-- the browser can no longer write to them at all.
--
-- Tenancy note: a shared tablet has no employee account, so it keeps writing
-- under the legacy unowned tenant (location_id IS NULL). NULLs are distinct in a
-- unique index, so the unowned rows never collide with a real branch.
BEGIN;

ALTER TABLE public.cleaning_logs ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.cleaning_logs ADD COLUMN IF NOT EXISTS week_start date;
ALTER TABLE public.cleaning_logs ADD COLUMN IF NOT EXISTS done_time text;

UPDATE public.cleaning_logs
  SET week_start = date_trunc('week', done_date)::date
  WHERE week_start IS NULL;

DO $$
DECLARE
  drum uuid;
BEGIN
  SELECT id INTO drum FROM public.locations WHERE slug = 'drumheller' ORDER BY created_at LIMIT 1;
  IF drum IS NOT NULL THEN
    UPDATE public.cleaning_logs SET location_id = drum WHERE location_id IS NULL;
    UPDATE public.cash_outs SET location_id = drum WHERE location_id IS NULL;
  END IF;
END $$;

-- Collapse duplicates before the unique indexes go on: keep the newest row of
-- each (branch, week, task) and of each (branch, day) so nothing is lost twice.
DELETE FROM public.cleaning_logs a
  USING public.cleaning_logs b
  WHERE a.location_id IS NOT DISTINCT FROM b.location_id
    AND a.week_start = b.week_start
    AND a.task_name = b.task_name
    AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id));

DELETE FROM public.cash_outs a
  USING public.cash_outs b
  WHERE a.location_id IS NOT DISTINCT FROM b.location_id
    AND a.count_date = b.count_date
    AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id));

CREATE INDEX IF NOT EXISTS cleaning_logs_location ON public.cleaning_logs(location_id, week_start);
CREATE UNIQUE INDEX IF NOT EXISTS cleaning_logs_branch_week_task
  ON public.cleaning_logs(location_id, week_start, task_name);
CREATE UNIQUE INDEX IF NOT EXISTS cash_outs_branch_date
  ON public.cash_outs(location_id, count_date);

-- Close the browser door. Reads stay open (the shared tablets still render
-- through a session-scoped read), but no browser role may insert, update or
-- delete: every write now goes through /api/btb/cleaning and /api/btb/cash-out,
-- which resolve the branch and the actor from the session.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cleaning_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cash_outs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.prep_counts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_sheets FROM anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cleaning_logs','cash_outs','prep_counts','order_sheets'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_public_all" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_public_write" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_public_read" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_public_read" ON public.%I FOR SELECT USING (true)', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
