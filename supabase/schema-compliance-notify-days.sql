-- Per-document reminder timing for Compliance & Renewals.
-- notify_days overrides the document type's default lead time for both the
-- in-app warning window and the BTB licence email reminders; notify=FALSE
-- already opts a document out. NULL notify_days keeps the type default.
-- Run AFTER schema-november-13-updates.sql. Idempotent: safe to re-run.

ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS notify_days INTEGER;
-- Keep values sane: 0 (due-date reminder) through one year ahead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'compliance_documents' AND column_name = 'notify_days') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT compliance_notify_days_range CHECK (notify_days IS NULL OR notify_days BETWEEN 0 AND 365);
  END IF;
END $$;
