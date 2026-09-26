-- Roles + server-side profile creation.
-- Run AFTER schema.sql and schema-rbac.sql. Supersedes the role CHECK there.
-- Mirrors src/lib/roles.ts — keep both in sync.

-- 1. Widen the role constraint to the full 6-role RBAC set.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('staff', 'manager', 'owner', 'multi_location_owner', 'corporate', 'designer'));

-- 1b. 30-day trial window. NULL = no trial limit (demo / paid).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 2. Auto-create the profile row when an auth user is created.
--    Runs as the definer, so it bypasses RLS and cannot fail on the
--    client-side pre-confirmation insert that was breaking sign-up.
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
    -- Trial signups carry trial=1 in metadata → 30 days from now.
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
