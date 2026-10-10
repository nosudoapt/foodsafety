-- Example inventory items so the sheet is usable on day one (manual step).
-- How to run: paste into the Supabase SQL Editor and press Run.
-- Safe to re-run: inserts only when inventory_items is completely empty.
-- Costs are examples — managers edit them on the Month-End Inventory page.
INSERT INTO inventory_items (name, unit, category, unit_cost, position)
SELECT * FROM (VALUES
  ('Sesame buns (case of 48)', 'case', 'Bakery', 18.50, 0),
  ('Brioche buns (case of 48)', 'case', 'Bakery', 21.00, 1),
  ('Beef patties 4oz (10 lb box)', 'box', 'Meat', 42.00, 2),
  ('Chicken breast (10 lb box)', 'box', 'Meat', 38.50, 3),
  ('Cheddar slices (5 lb)', 'pack', 'Dairy', 24.75, 4),
  ('Fries 3/8" (15 kg case)', 'case', 'Frozen', 28.00, 5),
  ('Lettuce (24 ct case)', 'case', 'Produce', 32.00, 6),
  ('Tomatoes (25 lb box)', 'box', 'Produce', 27.50, 7),
  ('Cooking oil (16 L)', 'jug', 'Dry goods', 34.00, 8),
  ('Milkshake mix (4 L)', 'jug', 'Dairy', 12.25, 9)
) AS v(name, unit, category, unit_cost, position)
WHERE NOT EXISTS (SELECT 1 FROM inventory_items);
