-- HTTP-12: off-form thresholds must be approved by a trusted operator, not staff.
-- Intentionally no production standard seeds or guessed food-safety limits.
BEGIN;
CREATE TABLE IF NOT EXISTS public.btb_temperature_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL,
  record_type text NOT NULL CHECK(record_type IN ('cooking','cooling','cold_storage','hot_holding','reheating','probe_calibration')),
  equipment_name text NOT NULL CHECK(length(trim(equipment_name)) BETWEEN 1 AND 150),
  min_safe_temp numeric(5,2) NOT NULL CHECK(min_safe_temp>=-273.15),
  max_safe_temp numeric(5,2) NOT NULL CHECK(max_safe_temp<=999.99 AND max_safe_temp>=min_safe_temp),
  approved_by text NOT NULL CHECK(length(trim(approved_by))>0),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(restaurant_name,record_type,equipment_name)
);
ALTER TABLE public.btb_temperature_standards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.btb_temperature_standards FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.btb_temperature_standards TO service_role;
DROP POLICY IF EXISTS btb_temperature_standards_private ON public.btb_temperature_standards;
CREATE POLICY btb_temperature_standards_private ON public.btb_temperature_standards AS RESTRICTIVE TO anon,authenticated
  USING(false) WITH CHECK(false);
NOTIFY pgrst,'reload schema';
COMMIT;
