# Between the Buns / workspace browser suite

`npm run e2e` drives the real Next server against `e2e/mock-supabase.mjs` — a
**plain PostgreSQL** (pglite) assembled from the BTB `supabase/schema-*.sql`
files, with a small PostgREST-compatible router in `e2e/btb-postgrest.mjs`.

## Status after the unified-auth cutover

| Area | State |
| --- | --- |
| Retired doors, 404s, redirects, sign-in form | **Runs.** `btb-redirects.spec.ts` proves `/btb/login`, `/btb/admin/login`, `/btb/demo-login` → `/auth/sign-in`, `/api/btb/locations` → 404, and that the form offers no second product door. |
| Every authenticated BTB / console spec | **Skipped, with a reason** (see below). `npx playwright test --list` still lists all of them. |

### Why the authenticated specs cannot run yet

The unified sign-in (`POST /api/auth/login`) resolves a credential through
`workspace_auth_candidate()` and writes a durable `workspace_auth_sessions` row.
Both live in migrations 57–59 and depend on Supabase Auth:

- `auth.users` (email, `encrypted_password`, `raw_user_meta_data`, bans) — the
  e2e database has no `auth` schema at all.
- the `authenticator` role, which migration 58 configures with
  `pgrst.db_pre_request`.
- `request.jwt.claims` / `request.headers` GUCs that `workspace_request_context()`
  reads to verify the session on every scoped query — PostgREST sets these; the
  e2e router executes SQL directly.

Applying 57/58 to the e2e database fails at the first of these
(`relation "auth.users" does not exist`, then
`extension "uuid-ossp" is not available` in `schema-locations.sql`). The
authenticated specs therefore stop at their first sign-in call, before any
assertion.

They are gated in one place — `e2e/fixtures.ts`:

```ts
export const authHarnessReady = process.env.E2E_AUTH_HARNESS === "1";
test.beforeEach(() => { test.skip(!authHarnessReady, AUTH_HARNESS_REASON); });
```

Specs that import `test` from `./fixtures` skip with that reason. Specs that
import from `@playwright/test` directly (`btb-redirects`, and the four
auth-dependent ones) handle themselves.

### How to switch them back on

1. In `tests/helpers/btb-capabilities-database.mjs`, bootstrap Supabase Auth
   before the cutover files: `CREATE ROLE authenticator NOINHERIT`,
   `CREATE SCHEMA auth`, and an `auth.users` table with the columns above. Teach
   `capabilitySql()` to drop `CREATE EXTENSION … "uuid-ossp"` (pglite ships
   `gen_random_uuid()` only), then apply
   `schema-workspace-auth-cutover.sql`, `schema-workspace-session-scope.sql` and
   `schema-btb-console-locations-fix.sql`.
2. In `e2e/mock-supabase.mjs`, route `/rest/v1/rpc/workspace_*` to
   `btbPostgrest` (today only `rpc/btb_*` is routed).
3. In `e2e/btb-postgrest.mjs`, set `request.jwt.claims` (`service_role`) and
   `request.headers` (`x-workspace-session`) per request so
   `workspace_request_context()` resolves the session, exactly as PostgREST does.
4. Seed `auth.users` + let the `handle_new_user` trigger provision, or seed
   `workspace_principals` for each fixture identity (`manager@btb.demo`,
   `console@workspace.test`, employees).
5. Run with `E2E_AUTH_HARNESS=1`.

Until then the authenticated browser coverage is **not** running — treat the
unit/integration suite (`npm test`) plus the live smoke checks as the current
safety net, and do the role-by-role walkthrough by hand before a client demo.
