-- Daily Prep Sheet (new 3-section layout) — the Freezer pull & Dairy column
-- records a PULL amount (how much was pulled from the freezer), which has no
-- home in the original par/on_hand pair.
--
-- Run AFTER step 11 (schema-locations.sql) and step 12
-- (schema-inspection-consolidation.sql). Idempotent: safe to re-run.
--
-- Until this has been run, the prep sheet still READS (the page fetches Pull
-- separately and tolerates its absence) but Save fails with a message naming
-- this file.

ALTER TABLE prep_counts ADD COLUMN IF NOT EXISTS pull NUMERIC NOT NULL DEFAULT 0;
