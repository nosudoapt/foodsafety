-- Seed: the four company-wide filing deadlines (manual step — NOT in migrations.json).
--
-- How to run: paste this whole file into the Supabase SQL Editor and press Run.
-- Safe to re-run: each title is inserted only when no row with that title
-- exists, so anything a manager has since edited is left alone.
-- Company-wide rows use location_id NULL; the app rolls each deadline forward
-- via its recurrence (see src/lib/tax-dates.ts nextOccurrence).

WITH wanted (title, category, due_date, recurrence, notes) AS (
  VALUES
    ('GST/HST Return', 'tax', DATE '2026-04-30', 'quarterly',
     'CRA Business Account — due 1 month after each quarter end (adjust dates to your filing period)'),
    ('PST Return', 'tax', DATE '2026-02-28', 'monthly',
     'Provincial sales tax — adjust frequency (monthly/quarterly/annual) to your assessment notice'),
    ('Corporation Registry Renewal', 'licence', DATE '2026-10-31', 'annual',
     'Annual corporate registry renewal — adjust to your incorporation anniversary month'),
    ('Year-End Tax Return', 'tax', DATE '2026-06-30', 'annual',
     'T2 corporate return — 6 months after a Dec 31 year-end; adjust if your year-end differs')
)
INSERT INTO corporate_dates (title, category, due_date, recurrence, notes, location_id)
SELECT w.title, w.category, w.due_date, w.recurrence, w.notes, NULL
FROM wanted w
WHERE NOT EXISTS (
  SELECT 1 FROM corporate_dates e WHERE e.title = w.title
);
