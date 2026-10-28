CREATE TABLE IF NOT EXISTS inventory_audit_log (
  id BIGSERIAL PRIMARY KEY,
  count_month TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE inventory_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ial_public_all" ON inventory_audit_log;
CREATE POLICY "ial_public_all" ON inventory_audit_log FOR ALL USING (true) WITH CHECK (true);
