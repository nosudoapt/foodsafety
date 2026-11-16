-- Signup role integrity (SEC-02).
-- Run AFTER fix-rls-profile-role.sql.
-- Idempotent. Does not edit the applied schema-roles.sql.
--
-- handle_new_user() used to copy raw_user_meta_data->>'role' into the new
-- profile, so a public signup could request role=corporate and receive it
-- at first login. The trigger now always starts a profile as 'staff';
-- elevated roles are granted afterwards by an operator (SQL Editor) or by
-- server code holding the privileged key, never by signup metadata.
BEGIN;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, restaurant_name, role, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'restaurant_name', ''),
    'staff',
    -- Trial signups carry trial=1 in metadata → 30 days from now.
    CASE WHEN NEW.raw_user_meta_data->>'trial' = '1'
         THEN NOW() + INTERVAL '30 days' ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
COMMIT;
