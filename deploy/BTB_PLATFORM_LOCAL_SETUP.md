# BTB platform — local setup and SQL release order

This runbook brings a **local or disposable** database up to the inventory,
finance and time releases. It is not a production deployment guide.

> **Do not point these steps at production.** The finance (`12`) and time (`13`)
> releases have **not** been applied to production. Do not run `db:migrate`,
> do not create `_migrations`, and do not paste any file in `supabase/` into a
> production SQL editor as part of this work.

## What this release adds

| Release | File | Adds |
|---|---|---|
| AI extraction (optional) | `supabase/schema-btb-platform-ai.sql` | `btb_ai_settings`, `btb_ai_usage`, `btb_ai_extract_prepare`; unconfigured AI answers 503 and supported GFS layouts are read offline |
| Finance `12` | `supabase/schema-btb-platform-finance.sql` | Approved-invoice ledger, stock balances/movements, supplier price history, purchase GST, bank statements/allocations, GST periods, replay-safe finance commands |
| Time `13` | `supabase/schema-btb-platform-time.sql` | Location-scoped shifts, original + effective punches, corrections, manager approval, replay-safe time commands |

Every file is additive and idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` /
`DROP … IF EXISTS`). A re-run is safe, but unnecessary.

## Prerequisites

- Node.js **22.23.2** (the Supabase client needs native WebSocket support).
- A **local** PostgreSQL 15+ or a local Supabase stack.
- The pre-existing BTB base schema already applied to that local database:
  legacy FoodSafe tables, BTB team operations and the uploader tables. Follow
  [BTB team setup](BTB_TEAM_SETUP.md) for those, against the local database only.
- No AI provider key is required. Without one, supported GFS invoice text is
  read locally and all other layouts fall back to manual review.

## Release order (dependency-sensitive)

Apply each file in its own transaction, in this order. Do not reorder finance
or time ahead of the releases they extend.

1. `supabase/schema-btb-platform-foundation.sql`
2. `supabase/schema-btb-platform-operations.sql`
3. `supabase/schema-btb-platform-inventory.sql`
4. `supabase/schema-btb-platform-marketing.sql`
5. `supabase/schema-btb-platform-automation.sql`
6. `supabase/schema-btb-platform-api.sql`
7. `supabase/schema-btb-platform-ai.sql` — after inventory
8. `supabase/schema-btb-platform-finance.sql` — after all six platform releases
9. `supabase/schema-btb-platform-time.sql` — after foundation/operations/api

The automated platform tests apply the same order in
`tests/helpers/btb-platform-database.mjs` (`platformMigrations`).

### Option A — local psql

```sh
export LOCAL_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' # local only
for file in \
  schema-btb-platform-foundation.sql \
  schema-btb-platform-operations.sql \
  schema-btb-platform-inventory.sql \
  schema-btb-platform-marketing.sql \
  schema-btb-platform-automation.sql \
  schema-btb-platform-api.sql \
  schema-btb-platform-ai.sql \
  schema-btb-platform-finance.sql \
  schema-btb-platform-time.sql; do
  echo "== $file"
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "supabase/$file"
done
```

### Option B — local Supabase CLI

If the local project already tracks the older releases as migrations, add the
new files as new local migrations in the same order and run:

```sh
supabase db reset   # local stack only — never production
```

Do not baseline or replay `_migrations` against production.

## Local environment

Copy `.env.example` to `.env.local` and point it at the local stack. Required
server values:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service-role key>
```

- Finance and time routes run through the service-role server client; never
  expose the service key with a `NEXT_PUBLIC_` prefix.
- AI extraction is optional. Add a provider key only through the in-app AI
  settings RPC; it is never returned to the browser.
- GFS invoice reading needs no key.

## Verify locally

```sh
# Read-only shape check on the local database
psql "$LOCAL_DB_URL" -c "\dt btb_invoices btb_stock_balances btb_bank_statements btb_gst_periods btb_time_entries btb_time_commands"
psql "$LOCAL_DB_URL" -c "select proname from pg_proc where proname in ('btb_platform_finance','btb_platform_finance_read','btb_platform_time','btb_platform_schedule') order by 1"
```

Then run the automated checks:

```sh
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
npm test
npx tsc --noEmit
npm run build
BTB_PASSWORD=browser-test-shared-password npx playwright test
```

The browser suite runs against the in-repo mock (PGlite + fixture server) on
ports 5101/5102 and never contacts a hosted database.

The real-invoice PDF check in `tests/btb-gfs-pdf.test.mjs` runs only when the
private reference invoice is available locally. It skips in a fresh checkout;
do not commit `reference-documents/` to enable it. The synthetic GFS reader
tests run without private documents.

## Behaviour this release relies on

- On-hand stock is **unknown** until a physical baseline count. Earlier
  approved receipts remain historical evidence and are not added again.
- Sales do **not** deduct stock in this version.
- Missing supplier subtotal/GST/dates stay missing. GST eligibility is a person's
  explicit verification, never inferred.
- Approved invoices, stock movements, corrections and reopenings keep their
  original evidence and reasons.
- Bank CSV import requires an explicit column mapping and date format; matches
  are suggestions until a person confirms them; reconciliation requires both
  actual balances.
- Approved worked hours are separate from scheduled shifts; self-approval is
  rejected; approved-hours exports use UTC timestamps.

## Stop conditions

- Any release raises an exception: its transaction rolled back. Fix the
  dependency order; do not bypass the guard.
- A migration command targets a hosted URL: stop. `db:migrate*` is prohibited
  for this work.
- Reconciliation or GST finalization appears to succeed without reviewer
  confirmation: stop and inspect the API/SQL, do not work around it.

## Explicitly prohibited

- Applying releases `12`/`13`, AI or any `supabase/*.sql` file to production.
- Creating or populating `_migrations` to satisfy a migration runner.
- Live-data resets, seed guesses, or inferred GST/date/eligibility values.
- Pasting secrets into SQL, logs, tests or chat.
