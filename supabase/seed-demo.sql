-- =============================================================================
-- FoodSafe — demo role accounts
-- Run this in the Supabase SQL editor (or `psql -f supabase/seed-demo.sql`).
--
-- Safe to re-run. Accounts are matched by EMAIL, never by a hardcoded UUID, so
-- it works whether the demo users already exist (created by the app's
-- /api/demo/session, sign-up, or a previous run) or not. Re-running also
-- re-sets their password and resets their data — see RESET at the bottom.
--
-- Accounts (see src/lib/demo-roles.ts — keep emails/roles in sync):
--   owner@foodsafe.demo     owner               Avery Chen      The Grill House
--   manager@foodsafe.demo   manager             Jordan Patel    The Grill House
--   staff@foodsafe.demo     staff               Sam Rivera      The Grill House
--   corporate@foodsafe.demo corporate           Morgan Blake    Grill House Group
--
-- Shared password: admin1234   (one password for BOTH surfaces)
--   The green demo reads it from DEMO_PASSWORD (src/lib/demo-server.ts) and
--   BTB from BTB_PASSWORD (src/lib/btb-auth.ts); both default to this value,
--   so the same email + password works on either sign-in page.
--
-- RESET APPROACH (requirement: public demos get messy fast)
--   These accounts are read-mostly: every re-run of this file deletes their
--   temperature/check/cleaning rows and re-inserts a small, clean sample set,
--   so a night's worth of visitor edits vanish. To automate it, schedule the
--   RESET section nightly — in Supabase: Database → Extensions → pg_cron, then
--     SELECT cron.schedule('reset-foodsafe-demo', '0 4 * * *',
--       $cron$ <contents of the RESET section> $cron$);
--   The demo accounts never carry a trial_ends_at, so they never expire.
-- =============================================================================

-- =============================================================================
-- PRE-FLIGHT — one-time schema catch-up for databases that predate
-- supabase/schema-roles.sql (a `corporate` role is otherwise rejected by the
-- old 3-role CHECK, and the app's proxy can't read trial_ends_at).
-- Every statement below is idempotent, so it is safe to run even if that file
-- has already been applied. Keep in sync with schema-roles.sql.
-- =============================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('staff', 'manager', 'owner', 'multi_location_owner', 'corporate', 'designer'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, restaurant_name, role, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'restaurant_name', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'staff'),
    CASE WHEN NEW.raw_user_meta_data->>'trial' = '1'
         THEN NOW() + INTERVAL '30 days' ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  acct RECORD;
  target_id UUID;
  demo_password TEXT := 'admin1234'; -- keep in sync with DEMO_PASSWORD / src/lib/demo-server.ts
  demo_meta JSONB;
BEGIN
  FOR acct IN
    SELECT * FROM (VALUES
      ('owner@foodsafe.demo',     'Avery Chen',   'The Grill House',   'owner'),
      ('manager@foodsafe.demo',   'Jordan Patel', 'The Grill House',   'manager'),
      ('staff@foodsafe.demo',     'Sam Rivera',   'The Grill House',   'staff'),
      ('corporate@foodsafe.demo', 'Morgan Blake', 'Grill House Group', 'corporate')
    ) AS t(email, full_name, restaurant_name, role)
  LOOP
    -- NEVER assume a UUID: resolve the account by email (unique index on
    -- auth.users would reject a fixed-id insert if the user already exists).
    SELECT id INTO target_id
    FROM auth.users
    WHERE lower(email) = lower(acct.email)
    LIMIT 1;

    demo_meta := jsonb_build_object(
      'full_name', acct.full_name,
      'restaurant_name', acct.restaurant_name,
      'role', acct.role
    );

    IF target_id IS NULL THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(), 'authenticated', 'authenticated', acct.email,
        crypt(demo_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        demo_meta,
        now(), now()
      )
      RETURNING id INTO target_id;
    ELSE
      -- Account already exists (possibly with a different UUID) — re-state the
      -- password and metadata, so this run doubles as a password reset.
      UPDATE auth.users
      SET encrypted_password = crypt(demo_password, gen_salt('bf')),
          email_confirmed_at = now(),
          raw_user_meta_data = demo_meta,
          updated_at = now()
      WHERE id = target_id;
    END IF;

    -- Email identity (required by some GoTrue flows). Guarded so a schema
    -- difference between Supabase versions never aborts the seed — password
    -- login works from auth.users alone.
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), target_id,
        jsonb_build_object('sub', target_id::text, 'email', acct.email, 'email_verified', true),
        'email', now(), now(), now()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'identity for % skipped: %', acct.email, SQLERRM;
    END;

    -- Profile row with the RBAC role, keyed by the resolved id. The
    -- handle_new_user trigger creates this for sign-ups; here we upsert so
    -- re-runs correct the role. role values mirror profiles_role_check /
    -- src/lib/roles.ts. trial_ends_at = NULL so demo accounts never expire.
    INSERT INTO public.profiles (id, email, full_name, restaurant_name, role, trial_ends_at)
    VALUES (target_id, acct.email, acct.full_name, acct.restaurant_name, acct.role, NULL)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      restaurant_name = EXCLUDED.restaurant_name,
      role = EXCLUDED.role,
      trial_ends_at = NULL,
      updated_at = now();
  END LOOP;
END $$;

-- =============================================================================
-- RESET — delete demo records so each visitor starts from the same place.
-- Re-running this whole file re-inserts the sample rows below.
-- Ids are looked up by email so this works no matter how the users were made.
-- =============================================================================
DELETE FROM public.temperature_records
WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) LIKE '%@foodsafe.demo');

DELETE FROM public.daily_checks
WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) LIKE '%@foodsafe.demo');

DELETE FROM public.cleaning_records
WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) LIKE '%@foodsafe.demo');

-- Sample records (owned by the demo accounts — what a shift would have logged).
INSERT INTO public.temperature_records
  (user_id, restaurant_name, equipment_name, record_type, food_item,
   temperature, unit, min_safe_temp, max_safe_temp, is_safe, notes, recorded_at)
SELECT u.id, v.restaurant_name, v.equipment_name, v.record_type, v.food_item,
       v.temperature, 'C', v.min_safe_temp, v.max_safe_temp, v.is_safe, v.notes,
       now() - v.age
FROM (SELECT id FROM auth.users WHERE lower(email) = 'staff@foodsafe.demo') u
CROSS JOIN (VALUES
  ('The Grill House', 'Walk-in Fridge', 'cold_storage', 'Chicken breasts', 3.4::numeric, 0.0::numeric, 5.0::numeric, TRUE,  'Within range',   interval '2 hours'),
  ('The Grill House', 'Flat Top Grill', 'cooking',      'Beef patty',     74.0::numeric, 71.0::numeric, 82.0::numeric, TRUE,  'Probe verified', interval '4 hours'),
  ('The Grill House', 'Soup Well',      'hot_holding',  'Tomato soup',    62.0::numeric, 60.0::numeric, 74.0::numeric, TRUE,  '',              interval '6 hours')
) AS v(restaurant_name, equipment_name, record_type, food_item, temperature, min_safe_temp, max_safe_temp, is_safe, notes, age);

INSERT INTO public.daily_checks
  (user_id, restaurant_name, check_type, checklist_items, completed, completed_at, notes)
SELECT u.id, 'The Grill House', v.check_type, v.items::jsonb, v.completed,
       CASE WHEN v.completed THEN now() - interval '1 day' END, v.notes
FROM (SELECT id FROM auth.users WHERE lower(email) = 'staff@foodsafe.demo') u
CROSS JOIN (VALUES
  ('opening',
   '[{"item":"Fridges at temp","done":true},{"item":"Handwash stations stocked","done":true},{"item":"Probe calibration","done":false}]',
   FALSE, 'Sample opening checklist')
) AS v(check_type, items, completed, notes);

INSERT INTO public.daily_checks
  (user_id, restaurant_name, check_type, checklist_items, completed, completed_at, notes)
SELECT u.id, 'The Grill House', v.check_type, v.items::jsonb, v.completed,
       CASE WHEN v.completed THEN now() - interval '1 day' END, v.notes
FROM (SELECT id FROM auth.users WHERE lower(email) = 'manager@foodsafe.demo') u
CROSS JOIN (VALUES
  ('closing',
   '[{"item":"Food stored","done":true},{"item":"Surfaces sanitised","done":true},{"item":"Bins emptied","done":true}]',
   TRUE, 'Sample closing checklist')
) AS v(check_type, items, completed, notes);
