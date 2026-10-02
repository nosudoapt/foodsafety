-- Emergency contacts → category directory (Electrician, Plumber, Grease Trap…).
-- Run AFTER schema-compliance.sql (creates emergency_contacts). Idempotent.
--
-- name = company, phone = first number; the three phone_* columns are the
-- "preferences" each saved entry carries. category groups entries into the
-- fixed trade/service columns the UI renders (free TEXT — custom services
-- store their label right here, no lookup table).

ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS phone_2 TEXT;
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS phone_3 TEXT;
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE emergency_contacts ALTER COLUMN category SET DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_emergency_category ON emergency_contacts(category);
