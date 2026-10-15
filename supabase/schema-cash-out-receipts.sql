-- Local purchase receipt photos — JSON array of ops-photos object paths.
-- Run AFTER supabase/schema-cash-out.sql. Idempotent: safe to re-run.
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS local_receipts TEXT;
