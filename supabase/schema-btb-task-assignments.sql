-- Step 49: per-person daily task assignments + the clock-out completion marker.
-- A manager/supervisor assigns an employee to one duty on one business date.
-- Completion is derived from the actual record (temperature sheet, prep counts,
-- checklist or cleaning log); nothing is ticked by hand on the assignment.
BEGIN;
CREATE TABLE IF NOT EXISTS public.btb_task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.btb_location_settings(location_id),
  employee_id uuid NOT NULL REFERENCES public.btb_employees(id),
  task_date date NOT NULL,
  task_type text NOT NULL CHECK (task_type IN ('temperature','prep_sheet','opening','closing','cleaning')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_by uuid REFERENCES public.btb_employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, employee_id, task_date, task_type)
);
CREATE INDEX IF NOT EXISTS btb_task_assignments_week ON public.btb_task_assignments(location_id, task_date, employee_id);
ALTER TABLE public.btb_task_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_task_assignments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.btb_task_assignments TO service_role;

ALTER TABLE public.btb_time_entries ADD COLUMN IF NOT EXISTS incomplete_tasks jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.btb_time_entries DROP CONSTRAINT IF EXISTS btb_time_entries_incomplete_tasks_array;
ALTER TABLE public.btb_time_entries ADD CONSTRAINT btb_time_entries_incomplete_tasks_array CHECK (jsonb_typeof(incomplete_tasks) = 'array');
NOTIFY pgrst,'reload schema';
COMMIT;
