-- Release 12, step 62: repair the scoped-row trigger.
--
-- workspace_guard_scoped_row() carried an unfinished "a stamped child may not
-- point at another-location parent" loop. Its SELECT projected `parent.relname`
-- and `parent.relnamespace`, but `parent` is a pg_attribute row, which has no
-- such columns — Postgres raises 42703 "column parent.relname does not exist".
-- The loop body was a no-op (`NULL;`), so it validated nothing and only ever
-- produced that error.
--
-- Because the trigger runs BEFORE INSERT/UPDATE/DELETE on every location-scoped
-- register, this broke every application write made with a verified session
-- (prep comments, temperatures, cleaning, orders, ...) while leaving reads and
-- service-role jobs working. Removing the dead block restores writes and takes
-- no authorization away: every other guard in the function is untouched.
BEGIN;

DO $$ DECLARE definition text; prior text;
BEGIN
  definition:=pg_get_functiondef('public.workspace_guard_scoped_row()'::regprocedure);
  prior:=definition;

  -- Drop the unfinished parent-reference block.
  definition:=regexp_replace(definition,
    '\s*-- A stamped child may not point at an unassigned or another-location parent\.[\s\S]*?END IF;',
    '', 'g');

  IF definition=prior THEN RAISE EXCEPTION 'Unexpected guard definition: parent block not found'; END IF;
  IF definition LIKE '%parent.relname%' THEN RAISE EXCEPTION 'The broken parent projection is still present'; END IF;
  IF definition NOT LIKE '%Row is not in the current workspace%' THEN
    RAISE EXCEPTION 'The workspace guard lost its location check';
  END IF;
  EXECUTE definition;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
