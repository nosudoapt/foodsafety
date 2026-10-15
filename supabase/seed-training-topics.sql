-- Starter training topics so the module opens with content on day one
-- (manual step — NOT in migrations.json).
-- How to run: paste into the Supabase SQL Editor and press Run.
-- Safe to re-run: inserts only when training_topics is completely empty.
-- Everything is a draft (published = false): managers review, edit, attach
-- videos, then Publish. Replace with your own SOPs any time.

WITH new_topics (title, category, est_minutes, position) AS (
  VALUES
    ('Handwashing & Gloves', 'food_safety', 5, 0),
    ('Temperature Control', 'food_safety', 8, 1),
    ('Allergen Awareness', 'food_safety', 8, 2),
    ('Cleaning & Sanitizing', 'cleaning', 6, 3),
    ('Fryer Safety', 'equipment', 6, 4),
    ('Opening & Closing Duties', 'service', 10, 5)
)
INSERT INTO training_topics (title, category, est_minutes, published, position)
SELECT title, category, est_minutes, false, position FROM new_topics
WHERE NOT EXISTS (SELECT 1 FROM training_topics);

WITH new_sections (topic_title, position, heading, body) AS (
  VALUES
    ('Handwashing & Gloves', 0, 'When to wash',
     'Wash hands for 20 seconds with soap under warm water.' || chr(10) || chr(10) ||
     '- before starting a shift' || chr(10) ||
     '- before putting gloves on' || chr(10) ||
     '- after touching raw meat, garbage, or your face' || chr(10) ||
     '- after every break'),
    ('Handwashing & Gloves', 1, 'Glove rules',
     'Gloves never replace handwashing — wash first, then glove.' || chr(10) || chr(10) ||
     '- change gloves every 4 hours or when torn' || chr(10) ||
     '- change gloves between raw and ready-to-eat tasks'),
    ('Temperature Control', 0, 'Danger zone',
     'Keep cold food at or below 4°C (40°F) and hot food at or above 60°C (140°F). The zone between is where bacteria grow.' || chr(10) || chr(10) ||
     '- check line and chef-base temps every shift' || chr(10) ||
     '- log readings on the temperature sheet'),
    ('Temperature Control', 1, 'Fridge & freezer',
     'Walk-in cooler 1–4°C, freezer at or below -18°C (0°F).' || chr(10) || chr(10) ||
     '- keep thermometers visible and calibrated' || chr(10) ||
     '- report anything out of range to the manager at once'),
    ('Allergen Awareness', 0, 'The big ones',
     'Take every allergy claim seriously — when in doubt, ask the manager.' || chr(10) || chr(10) ||
     '- know which buns contain sesame, dairy, and egg (see Bun Allergy Chart)' || chr(10) ||
     '- gluten-free orders go on a gluten-free bun with clean tools'),
    ('Allergen Awareness', 1, 'Avoiding cross-contact',
     'Clean surfaces, boards, and utensils before an allergen-free order.' || chr(10) || chr(10) ||
     '- wash hands and change gloves first' || chr(10) ||
     '- use separate fryer baskets where the recipe requires it'),
    ('Cleaning & Sanitizing', 0, 'Clean, then sanitize',
     'Cleaning removes dirt; sanitizing kills germs. Always do both, in that order.' || chr(10) || chr(10) ||
     '- mix sanitizer to the label strength and check with test strips' || chr(10) ||
     '- let surfaces air-dry — never towel-dry sanitizer off'),
    ('Cleaning & Sanitizing', 1, 'Daily minimums',
     'Wipe line and high-touch points every shift; sweep and mop floors front and back nightly.' || chr(10) || chr(10) ||
     '- follow the weekly cleaning schedule for deep tasks' || chr(10) ||
     '- photograph before and after where the schedule asks for it'),
    ('Fryer Safety', 0, 'Operating the fryer',
     'Fryer oil sits at 350°F — treat it with respect.' || chr(10) || chr(10) ||
     '- lower baskets slowly; never drop food in' || chr(10) ||
     '- never leave a hot fryer unattended' || chr(10) ||
     '- keep water far away from hot oil'),
    ('Fryer Safety', 1, 'Filtering & shutdown',
     'Filter oil per the schedule and shut the fryer down at close.' || chr(10) || chr(10) ||
     '- wear heat gloves and an apron while filtering' || chr(10) ||
     '- confirm the fryer is off before leaving (see Closing Checklist)'),
    ('Opening & Closing Duties', 0, 'Opening',
     'Work through the Opening Checklist on the tablet every morning.' || chr(10) || chr(10) ||
     '- signs, tablets, debit machine, and menu TV first' || chr(10) ||
     '- hoods, hot plate, fryer, and toaster before first order'),
    ('Opening & Closing Duties', 1, 'Closing',
     'Work through the Closing Checklist every night and tick each item.' || chr(10) || chr(10) ||
     '- all equipment off, line covered, floors mopped' || chr(10) ||
     '- double-check locks, appliances, and lights before leaving')
)
INSERT INTO training_sections (topic_id, position, heading, body)
SELECT t.id, s.position, s.heading, s.body
FROM new_sections s
JOIN training_topics t ON t.title = s.topic_title
WHERE NOT EXISTS (
  SELECT 1 FROM training_sections e
  WHERE e.topic_id = t.id AND e.heading = s.heading
);
