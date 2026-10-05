-- Seed: demo Emergency Contacts (manual step — NOT in migrations.json).
--
-- Why: emergency_contacts shipped with no rows, so every role — staff most of
-- all, since staff is read-only there (btb-access: view ALL / edit MGR_ONLY) —
-- saw eleven empty "preference slots" categories and nothing else.
--
-- How to run: paste this whole file into the Supabase SQL Editor and press Run.
-- Safe to re-run: each category is inserted only when it has no rows at all,
-- so anything a manager has since edited or added is left alone.
--
-- Reads as: company -> name, phones -> phone / phone_2 / phone_3,
-- contact person -> contact_name (src/components/EmergencyContacts.tsx).
-- `category` must be one of the fixed group ids or the card shows up as a
-- custom category instead.

WITH wanted (category, name, kind, phone, phone_2, contact_name, email, rank, notes) AS (
  VALUES
    -- TRADE
    ('electrician',    'Voltline Electric Services',    'service', '(519) 555-0101', NULL,                    'Dave Mercer',     'dispatch@voltline.example',   1, 'Panel trips, cooler circuits, walk-in lighting'),
    ('plumber',        'Rapid Flow Plumbing',           'service', '(519) 555-0102', NULL,                    'Ana Reyes',       'service@rapidflow.example',    1, 'Backup floor drains and prep-sink backups'),
    ('handyman',       'Handy Dave Home Repair',        'service', '(519) 555-0103', NULL,                    'Dave Kaur',       NULL,                           1, 'Small fixes — doors, shelving, tiling'),
    ('hvac',           'CoolTech Refrigeration',        'service', '(519) 555-0104', '(519) 555-0144',        'Sam Okafor',      '24h@cooltech.example',         1, 'URGENT for walk-in / reach-in failures — call the 24h line first'),
    ('hvac',           'CoolTech Refrigeration (parts)', 'service', '(519) 555-0145', NULL,                    NULL,              NULL,                           2, 'Gaskets, thermostats, filters'),
    -- SERVICES
    ('grease_trap',     'BlueWater Grease Trap',        'service', '(519) 555-0105', NULL,                    'Marta Silva',     'bookings@bluewater.example',   1, 'Monthly pump-out — first Tuesday'),
    ('pest_control',    'Shield Pest Control',          'service', '(519) 555-0106', NULL,                    'Ken Patel',       'ops@shieldpest.example',       1, 'Monthly service + health-inspection reports'),
    ('canadian_linen',  'Canadian Linen',               'service', '(519) 555-0107', NULL,                    'Route driver',    NULL,                           1, 'Uniform and apron exchange — Tuesday delivery'),
    ('internet_provider','FiberLink Business Internet', 'service', '(519) 555-0108', '(519) 555-0188',        'Support desk',    'support@fiberlink.example',    1, 'Second line is the after-hours NOC — keeps POS online'),
    ('security_system', 'SecureWatch Alarms',           'service', '(519) 555-0109', NULL,                    'Monitoring centre','alarm@securewatch.example',    1, 'Alarm codes, camera and safe service'),
    ('hoods_repair',    'ProHood Duct & Hood Cleaning', 'service', '(519) 555-0110', NULL,                    'Gordon Lee',      'bookings@prohood.example',     1, 'Kitchen exhaust cleaning — required for insurance'),
    ('fire_suppression','FireGuard Suppression Systems','service', '(519) 555-0111', NULL,                    'On-call tech',    'service@fireguard.example',    1, 'Hood system and extinguisher inspections'),
    -- Custom group (not a fixed category — shows as its own card)
    ('Emergency',       'Emergency — Police / Fire / Ambulance', 'service', '911',    NULL,                    NULL,              NULL,                           1, 'Life safety first, then call the owner'),
    ('Emergency',       'Poison Control Centre',                'service', '1-800-268-9017', NULL,             NULL,              NULL,                           2, 'Food contamination and chemical exposure'),
    ('Emergency',       'Public Health (region) — food complaints', 'service', '(519) 555-0199', NULL,        'Duty inspector',  NULL,                           3, 'Call before a suspected outbreak; have your last inspection date ready')
)
INSERT INTO emergency_contacts
  (category, name, kind, phone, phone_2, contact_name, email, rank, notes, restaurant_name)
SELECT w.category, w.name, w.kind, w.phone, w.phone_2, w.contact_name, w.email, w.rank, w.notes, 'Between the Buns'
FROM wanted w
WHERE NOT EXISTS (
  SELECT 1 FROM emergency_contacts e WHERE e.category = w.category
);
