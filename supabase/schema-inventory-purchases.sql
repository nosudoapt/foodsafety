-- Inventory purchases ledger (GFS invoices + local purchases).
-- One source of truth for eligible monthly purchases.
CREATE TABLE IF NOT EXISTS inventory_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_month TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gfs','local')),
  supplier TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  reference TEXT,
  notes TEXT,
  cash_out_id UUID,
  counted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_purch_month ON inventory_purchases(count_month);
CREATE INDEX IF NOT EXISTS idx_inv_purch_date ON inventory_purchases(purchase_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_gfs_invoice ON inventory_purchases(type, supplier, reference) WHERE type='gfs' AND reference IS NOT NULL;
ALTER TABLE inventory_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_purch_public_all" ON inventory_purchases;
CREATE POLICY "inv_purch_public_all" ON inventory_purchases FOR ALL USING (true) WITH CHECK (true);
