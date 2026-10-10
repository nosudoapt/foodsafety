-- Cash Out extra columns — local purchases ($ out of the drawer) plus the
-- nightly counts: single/large serving trays, Google review cards, open tickets.
-- Run AFTER supabase/schema-cash-out.sql. Idempotent: safe to re-run.
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS local_purchase NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS single_trays   NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS large_trays    NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS review_cards   NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS open_tickets   NUMERIC NOT NULL DEFAULT 0;
