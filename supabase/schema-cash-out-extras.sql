-- Step 47: cash-out wastage and staff-meal lines. Both are JSON arrays on the
-- existing day row so the till totals never change: wastage is a stock/quality
-- record, a staff meal is a benefit record. No price is inferred.
BEGIN;
ALTER TABLE public.cash_outs ADD COLUMN IF NOT EXISTS wastage jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cash_outs ADD COLUMN IF NOT EXISTS staff_meals jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cash_outs DROP CONSTRAINT IF EXISTS cash_outs_wastage_array;
ALTER TABLE public.cash_outs ADD CONSTRAINT cash_outs_wastage_array CHECK (jsonb_typeof(wastage) = 'array');
ALTER TABLE public.cash_outs DROP CONSTRAINT IF EXISTS cash_outs_staff_meals_array;
ALTER TABLE public.cash_outs ADD CONSTRAINT cash_outs_staff_meals_array CHECK (jsonb_typeof(staff_meals) = 'array');
COMMIT;
