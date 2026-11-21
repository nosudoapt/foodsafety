-- Step 39: the four-week onboarding programme from TRAINING MODULE.pdf.
-- Idempotent: fixed ids, so re-running updates the same topics/sections and
-- keeps employee records and review history. Week 4 is manager-only and its
-- reviews are routed to the owner by the API.
BEGIN;

DO $$ BEGIN
  IF to_regclass('public.training_topics') IS NULL OR to_regclass('public.training_sections') IS NULL
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='training_topics' AND column_name='audience') THEN
    RAISE EXCEPTION 'Install steps 19 and 38 before step 39' USING ERRCODE='42P01';
  END IF;
END $$;

INSERT INTO public.training_topics (id,location_id,title,category,est_minutes,published,position,audience,created_by)
VALUES
  ('7a000000-0000-4000-8000-000000000001',NULL,'Week 1 — Basic Introduction & Food Safety','food_safety',90,true,10,'staff','TRAINING MODULE'),
  ('7a000000-0000-4000-8000-000000000002',NULL,'Week 2 — Line Training & Menu Mastery','service',90,true,11,'staff','TRAINING MODULE'),
  ('7a000000-0000-4000-8000-000000000003',NULL,'Week 3 — POS Training & Customer Service','service',75,true,12,'staff','TRAINING MODULE'),
  ('7a000000-0000-4000-8000-000000000004',NULL,'Week 4 — Management Training','service',90,true,13,'manager','TRAINING MODULE')
ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title, category=EXCLUDED.category, est_minutes=EXCLUDED.est_minutes,
  published=true, position=EXCLUDED.position, audience=EXCLUDED.audience;

INSERT INTO public.training_sections (id,topic_id,position,heading,body) VALUES
  ('7a100000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001',0,'Welcome & Introduction',E'- Meet the team and understand the restaurant''s mission and values.\n- Tour of the restaurant (front-of-house and back-of-house).\n- Overview of the menu, kitchen layout, and equipment.'),
  ('7a100000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001',1,'Food Safety & Sanitation',E'- Introduction to food safety protocols.\n- Hand washing, sanitation, and personal hygiene.\n- Overview of safe food handling practices (temperature control, cross-contamination prevention).'),
  ('7a100000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000001',2,'Food Prep Training',E'- Handling and prepping all produce (washing, cutting, storing).\n- Sauce preparation, meat handling, portioning and making starches.'),
  ('7a100000-0000-4000-8000-000000000004','7a000000-0000-4000-8000-000000000001',3,'Fryer Station & Drink Preparation',E'- Learn fryer operation and safety.\n- Frying techniques (timing, temperature, and presentation).\n- Introduction to the drink station: making milkshakes and smoothies.'),
  ('7a100000-0000-4000-8000-000000000005','7a000000-0000-4000-8000-000000000002',0,'Full Menu Overview',E'- Detailed training on all menu items (ingredients, preparation methods, and presentation).\n- Focus on speed and consistency during peak hours.\n- Practise making all food items and ensuring they meet quality standards.'),
  ('7a100000-0000-4000-8000-000000000006','7a000000-0000-4000-8000-000000000002',1,'Packaging & Presentation',E'- Learn proper packaging for takeout and delivery, including self and third-party delivery.\n- Ensure food is packaged securely and looks appetizing for customers.'),
  ('7a100000-0000-4000-8000-000000000007','7a000000-0000-4000-8000-000000000002',2,'Fryer and Grill Stations',E'- Master fryer and grill operations, ensuring food quality.\n- Learn the different components of the line, including timing and multitasking.')
ON CONFLICT (id) DO UPDATE SET
  topic_id=EXCLUDED.topic_id, position=EXCLUDED.position, heading=EXCLUDED.heading, body=EXCLUDED.body;

INSERT INTO public.training_sections (id,topic_id,position,heading,body) VALUES
  ('7a100000-0000-4000-8000-000000000008','7a000000-0000-4000-8000-000000000003',0,'POS System Training',E'- Introduction to the POS (Point of Sale) system.\n- How to ring up orders, process payments, and handle cash and card transactions.\n- Learn how to take split payments, partial refunds and full refunds.\n- Learn how to take manual payments.\n- Learn how to process discounts and promotions.\n- Learn how to activate, balance check and redeem a gift card.\n- Learn how to activate and redeem loyalty rewards.'),
  ('7a100000-0000-4000-8000-000000000009','7a000000-0000-4000-8000-000000000003',1,'Upselling & Combo Creation',E'- Learn the art of upselling (suggesting add-ons, drinks, or sides).\n- Practise creating meal combos based on customer preferences and specials.'),
  ('7a100000-0000-4000-8000-000000000010','7a000000-0000-4000-8000-000000000003',2,'Handling Customer Interactions',E'- Train on customer service skills: greeting customers, taking orders, and addressing concerns.\n- Learn to effectively manage customer complaints, ensuring satisfaction.'),
  ('7a100000-0000-4000-8000-000000000011','7a000000-0000-4000-8000-000000000004',0,'Inventory Management',E'- How to conduct inventory checks.\n- Understand stock levels, proper storage, and maintaining ingredient quality.\n- Learn ordering systems and how to track usage.'),
  ('7a100000-0000-4000-8000-000000000012','7a000000-0000-4000-8000-000000000004',1,'Back Office POS & Scheduling',E'- Introduction to the back-office functions of the POS (reporting, analysis, and closing procedures).\n- Scheduling staff and understanding labour laws.'),
  ('7a100000-0000-4000-8000-000000000013','7a000000-0000-4000-8000-000000000004',2,'Receiving & Supply Management',E'- How to receive and check incoming orders.\n- Verify product quality and document any discrepancies.'),
  ('7a100000-0000-4000-8000-000000000014','7a000000-0000-4000-8000-000000000004',3,'Maintaining Cleanliness & Safety Protocols',E'- Learn how to maintain cleanliness in both the kitchen and dining areas.\n- Review food safety protocols and ensure proper food storage.'),
  ('7a100000-0000-4000-8000-000000000015','7a000000-0000-4000-8000-000000000004',4,'Customer Service & Leadership',E'- Leading by example in customer service.\n- Review staff training techniques and how to motivate the team.\n- How to resolve customer complaints in a calm, professional manner.')
ON CONFLICT (id) DO UPDATE SET
  topic_id=EXCLUDED.topic_id, position=EXCLUDED.position, heading=EXCLUDED.heading, body=EXCLUDED.body;

NOTIFY pgrst,'reload schema';
COMMIT;

