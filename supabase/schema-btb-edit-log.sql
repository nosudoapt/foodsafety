-- Release 11: field-level audit for the prep and order sheets.
-- Owner/supervisor only (enforced in the API); the browser never reads it.
BEGIN;

CREATE TABLE IF NOT EXISTS public.btb_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'Between the Buns',
  location_id uuid NOT NULL REFERENCES public.locations(id),
  area text NOT NULL CHECK (area IN ('prep','order')),
  sheet_date date NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL CHECK (length(btrim(actor_name)) BETWEEN 1 AND 120),
  actor_role text NOT NULL CHECK (length(btrim(actor_role)) BETWEEN 1 AND 40),
  section text NOT NULL DEFAULT '',
  item_name text NOT NULL DEFAULT '',
  field text NOT NULL CHECK (length(btrim(field)) BETWEEN 1 AND 40),
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS btb_edit_log_scope ON public.btb_edit_log(location_id, area, created_at DESC);
CREATE INDEX IF NOT EXISTS btb_edit_log_recent ON public.btb_edit_log(created_at DESC);

DO $$ BEGIN
  ALTER TABLE public.btb_edit_log ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.btb_edit_log FROM PUBLIC, anon, authenticated;
  GRANT ALL ON public.btb_edit_log TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
