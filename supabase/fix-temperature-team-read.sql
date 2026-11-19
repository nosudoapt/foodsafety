-- Dashboard site figures are only honest when managers and owners can read the
-- temperature evidence their team recorded. Staff keep their own-record policy;
-- elevated roles may read their restaurant's records (the browser then scopes
-- each query to the locations the signed-in profile can access).
BEGIN;

DROP POLICY IF EXISTS "Managers can view restaurant temperature records" ON public.temperature_records;
CREATE POLICY "Managers can view restaurant temperature records" ON public.temperature_records
  FOR SELECT TO authenticated
  USING (
    restaurant_name = (SELECT restaurant_name FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'multi_location_owner', 'corporate', 'manager')
    )
  );

COMMIT;
