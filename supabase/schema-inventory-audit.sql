-- Inventory audit trail — one row per protected action (finalize, reopen,
-- correction). Stores a JSONB copy of the figures at the moment of the action
-- so a finalized snapshot is never lost even after a reopen/correction cycle.
-- Run AFTER schema-inventory-snapshots.sql. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS inventory_audit_log (
  id BIGSERIAL PRIMARY KEY,
  count_month TEXT NOT NULL,
  action TEXT NOT NULL,                        -- finalize | reopen | correct
  actor TEXT,                                  -- role that performed the action
  reason TEXT,                                 -- required for reopen/correct
  snapshot JSONB,                              -- the figures at action time
  version INTEGER,                             -- snapshot version referenced
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ial_public_all" ON inventory_audit_log;
-- Append-only from the server routes; reads open (BTB tablets have no session).
CREATE POLICY "ial_public_all" ON inventory_audit_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_audit_month ON inventory_audit_log(count_month, created_at DESC);
