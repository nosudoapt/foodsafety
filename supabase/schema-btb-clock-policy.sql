-- Step 50: on-site clock-in policy. Server-enforced geofence, restaurant
-- network allowlist and one-device binding. These deter remote clock-ins; only
-- an on-site NFC/QR tag or biometric terminal can prove physical presence
-- against a determined attacker. Every attempt is audited.
BEGIN;
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS clock_latitude numeric(9,6);
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS clock_longitude numeric(9,6);
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS clock_radius_m integer NOT NULL DEFAULT 150;
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS clock_geofence boolean NOT NULL DEFAULT false;
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS clock_networks text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS clock_require_network boolean NOT NULL DEFAULT false;
ALTER TABLE public.btb_location_settings ADD COLUMN IF NOT EXISTS clock_require_device boolean NOT NULL DEFAULT false;
ALTER TABLE public.btb_location_settings DROP CONSTRAINT IF EXISTS btb_clock_radius_range;
ALTER TABLE public.btb_location_settings ADD CONSTRAINT btb_clock_radius_range CHECK (clock_radius_m BETWEEN 25 AND 5000);
ALTER TABLE public.btb_location_settings DROP CONSTRAINT IF EXISTS btb_clock_latitude_range;
ALTER TABLE public.btb_location_settings ADD CONSTRAINT btb_clock_latitude_range CHECK (clock_latitude IS NULL OR clock_latitude BETWEEN -90 AND 90);
ALTER TABLE public.btb_location_settings DROP CONSTRAINT IF EXISTS btb_clock_longitude_range;
ALTER TABLE public.btb_location_settings ADD CONSTRAINT btb_clock_longitude_range CHECK (clock_longitude IS NULL OR clock_longitude BETWEEN -180 AND 180);

CREATE TABLE IF NOT EXISTS public.btb_clock_devices (
  employee_id uuid PRIMARY KEY REFERENCES public.btb_employees(id),
  location_id uuid NOT NULL REFERENCES public.btb_location_settings(location_id),
  device_hash text NOT NULL CHECK (length(device_hash) = 64),
  bound_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  bound_by uuid REFERENCES public.btb_employees(id)
);
CREATE TABLE IF NOT EXISTS public.btb_clock_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.btb_employees(id),
  location_id uuid REFERENCES public.btb_location_settings(location_id),
  allowed boolean NOT NULL,
  reason text NOT NULL DEFAULT '',
  ip text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_m numeric(7,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS btb_clock_attempts_recent ON public.btb_clock_attempts(location_id, created_at DESC);
ALTER TABLE public.btb_clock_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.btb_clock_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_clock_devices,public.btb_clock_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.btb_clock_devices,public.btb_clock_attempts TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
