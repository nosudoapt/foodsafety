-- POS Down protocol — inserts only when no row with that title exists, so
-- stores that already have protocols keep their wording untouched.
-- (Manual step — NOT in migrations.json. Paste into the Supabase SQL Editor.)
INSERT INTO operational_protocols (title, icon, steps, sort_order)
SELECT
  'POS Down',
  '🧾',
  '["Stay calm — take orders on the manual order pad", "Check Wi-Fi and power to the terminals first", "Restart the affected terminal (wait 60s)", "Accept cash only until the POS is back", "Write every order down with time + table", "Call POS support (see Emergency Contacts) and re-enter tickets once restored"]'::jsonb,
  COALESCE((SELECT MAX(sort_order) FROM operational_protocols), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM operational_protocols WHERE title = 'POS Down'
);
