# Production Deployment Runbook — inventory prototype

Manual SQL Editor deployment for the Supabase free prototype. **Three SQL
scripts to run, in order.** Everything else is optional hardening. No script
in this directory has been executed against production.

| File | What it does | When |
|------|--------------|------|
| `01-preflight.sql` | Read-only inspection of live schema, RLS, grants, row counts | Step 1 — always safe |
| `02-create-missing-tables.sql` | Creates ONLY `inventory_month_snapshots` + `inventory_audit_log` (repo steps 25/26, idempotent, guarded) | Step 2 — after step 1 review |
| `03-verify.sql` | Read-only verification: new-table shape, preserved rows (67 in `role_page_access`), ledger-equivalence evidence | Step 3 — after step 2 |
| `04-security-hardening.sql` | Revokes anon access to the 7 sensitive tables | **NOT yet** — see its prerequisites |
| `ledger-reconciliation.md` | Runner `--baseline 27` to adopt the DB in the migration ledger | Optional, later |

## The runbook

1. **Backup.** Supabase Dashboard → Database → Backups: confirm a restore
   point exists. (Free tier keeps ~7 days; a test restore has never been
   done — treat recovery as unproven.)
2. **Run `01-preflight.sql`** in SQL Editor. Confirm: 5 inventory tables
   exist; `inventory_month_snapshots` / `inventory_audit_log` /
   `_migrations` absent; `role_page_access` = 67 rows.
3. **Run `02-create-missing-tables.sql`** as a whole (one transaction:
   both tables or nothing). Re-running is safe.
4. **Run `03-verify.sql`.** Confirm: 2 new tables with 15/8 columns; both
   empty; all prior row counts identical (`role_page_access` still 67);
   3.9 returns 0 missing tables.
5. **Deploy the app** (the repo at this commit). The month-end page, its
   API routes, finalize/reopen and role-page-access now run through
   server-side routes with BTB cookie auth — the browser no longer talks to
   Supabase directly. Works with or without the service-role key (falls
   back to anon with a server-side warning).
6. **(Recommended, enables step 7)** Set `SUPABASE_SERVICE_ROLE_KEY` in the
   server environment only (Dashboard → Project Settings → API →
   service_role secret → into your host's env vars, and `.env.local` for
   local dev). Never a `NEXT_PUBLIC_*` name; never committed.
7. **(Later, optional)** Follow `04-security-hardening.sql`: only after the
   workflows pass on the deployed app AND the service-role key is live.
   Its closing curl probes must return 401/403 before the exposure is
   called fixed.
8. **(Later, optional)** Follow `ledger-reconciliation.md` once
   `SUPABASE_DB_URL` is fixed.

## Do NOT run until…

- **02**: a restore point exists and 01 shows the two tables absent/compatible.
- **04 in full**: app deployed + service-role key configured + workflows tested.
- **Any runner command** (`npm run db:migrate*`): until 03 passes, the URL is
  fixed, and you've read `ledger-reconciliation.md`. With an empty ledger a
  plain `db:migrate` would execute steps 1–27, **including seed-demo.sql**.

## What this deployment does NOT change

- The anon exposure on the 5 existing inventory tables remains OPEN until
  step 7 — anyone holding the anon key can still read/write them.
- No production SQL has been executed by this package; nothing is "fixed"
  until you run the steps and 03 confirms them.
