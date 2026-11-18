-- SEC-08: preserve temperature evidence when its login/profile is removed.
-- The profile may still cascade from auth.users; evidence attribution remains
-- in the immutable before/after audit snapshots, not a cascading FK.
BEGIN;
ALTER TABLE public.temperature_records ALTER COLUMN user_id DROP NOT NULL;
DO $$ DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.temperature_records'::regclass AND contype='f'
      AND confrelid='public.profiles'::regclass
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.temperature_records'::regclass AND attname='user_id')]::smallint[]
  LOOP EXECUTE format('ALTER TABLE public.temperature_records DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE public.temperature_records ADD CONSTRAINT temperature_records_user_id_fkey
  FOREIGN KEY(user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
COMMIT;
