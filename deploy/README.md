# Inventory prototype — final deployment runbook

For the employee accounts, operations, training and licence-email release, use
[BTB team setup](BTB_TEAM_SETUP.md). Its additional SQL and email configuration
are separate deployment steps from this inventory runbook.

For Vercel dashboard and Supabase SQL Editor instructions, use
[BTB dashboard setup](BTB_DASHBOARD_SETUP.md).

Production schema creation and verification (`01b` → `02` → `03`) have been
reported complete. `_migrations` remains absent **by design**: do not run or
baseline the migration runner against production.

## Files

| File | Purpose | Current use |
|---|---|---|
| `01b-compact-preflight.sql` | One-grid, read-only schema/security report | Retained for diagnosis |
| `02-create-missing-tables.sql` | Guarded creation of snapshots + audit tables | Already reported complete; do not rerun unnecessarily |
| `03-verify.sql` | Read-only post-schema verification | Already reported complete |
| `04-security-hardening.sql` | Final guarded revocation of browser DB access | **Remaining inventory production SQL** |

## Finish line

Use **Node.js 22 or later** for the build and server runtime. The installed
Supabase client requires the native WebSocket support in Node 22+; `.nvmrc`
selects Node 22 for local development and verification.

1. In the **hosting provider's server environment**, configure strong values
   for `SUPABASE_SERVICE_ROLE_KEY`, `BTB_PASSWORD`, and `BTB_SESSION_TOKEN`
   (plus `SUPABASE_URL` if `NEXT_PUBLIC_SUPABASE_URL` is not already correct).
   Never use `NEXT_PUBLIC_*` for a secret. Redeploy the final commit.
2. Sign in as BTB manager/admin and open
   `/api/btb/inventory-health`. Continue only if it returns HTTP 200 with
   `deployment: "inventory-server-v3"` and `serviceRoleConfigured: true`.
3. Confirm a usable Supabase restore point, then run
   `deploy/04-security-hardening.sql` once in SQL Editor. It changes
   permissions/policies only; it does not change rows.
4. Run `npm run verify:inventory-security` from a configured local checkout.
   It prints no key, reads no rows (`limit=0`), and sends only no-match DELETE
   probes. All 14 statuses must be 401/403. Re-open the health URL; it must
   still return 200.

## Stop conditions

- Health endpoint is 401/403: sign in with a manager/admin BTB account.
- Health endpoint is 503: the final app/config is not live; **do not run 04**.
- `04-security-hardening.sql` raises an exception: its transaction rolled back;
  do not bypass the guard.
- Security verifier reports anything other than 401/403: direct DB exposure
  remains; do not call hardening complete.

## Explicitly prohibited

- Do not run `npm run db:migrate*` against production.
- Do not create or populate `_migrations` merely to silence its absence.
- Do not run `seed-demo.sql`, reset data, or paste secrets into SQL/chat/logs.
