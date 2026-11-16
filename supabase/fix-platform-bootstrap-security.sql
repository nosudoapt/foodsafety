-- HTTP-05: additive hardening after schema-platform-admin.sql.
-- No policies do not protect a table until RLS is actually enabled. Keep the
-- owner passcode hash and bootstrap claim server-only even if grants or a
-- historical permissive policy are accidentally restored later.
BEGIN;
ALTER TABLE public.platform_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_auth FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_auth TO service_role;
DROP POLICY IF EXISTS platform_auth_server_boundary ON public.platform_auth;
CREATE POLICY platform_auth_server_boundary ON public.platform_auth
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING(false) WITH CHECK(false);
COMMIT;
