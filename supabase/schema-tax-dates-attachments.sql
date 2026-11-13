-- Tax & filing dates — attach the filed document to the deadline.
-- A GST return PDF, payroll remittance record, insurance certificate etc. can
-- now be saved beside the date it belongs to (same data-URL pattern as the
-- compliance and business-document registers).
-- Run AFTER schema-tax-dates.sql. Idempotent: safe to re-run.

ALTER TABLE corporate_dates ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE corporate_dates ADD COLUMN IF NOT EXISTS file_url TEXT;
