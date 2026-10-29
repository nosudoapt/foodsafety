# Stage D — Migration Ledger Reconciliation (PLAN — not a SQL script)

**Status: BLOCKED until Stage B is applied and `SUPABASE_DB_URL` is fixed.**
Nothing in this file is SQL to paste into the Supabase SQL Editor. The ledger
must be created by the repository's own migration runner (`scripts/migrate.mjs`),
because only the runner knows the exact ledger DDL and checksum algorithm, and
because a hand-written ledger can silently diverge from what the runner expects.

## Why not hand-write ledger rows

The runner (`scripts/migrate-lib.mjs`):

- stores `_migrations(id SERIAL PK, step INT NOT NULL, filename TEXT NOT NULL
  UNIQUE, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT now(),
  duration_ms INT)`;
- computes `checksum = sha256(file_text with CRLF normalized to LF)`;
- on each run, **re-executes** any manifest step whose filename is absent from
  the ledger or whose stored checksum differs from the current file
  (`scripts/migrate.mjs` re-applies pending steps by running the SQL file).

Re-executing steps 1–23 would be destructive to review: those files include
`seed-demo.sql`, `seed-emergency-contacts.sql`, etc. Writing partial ledger
rows (say, only steps 24–27) would leave steps 1–23 "pending" and a future
`npm run db:migrate` would run seed files against production. Fabricating
checksums (or marking steps applied without proven equivalence) is explicitly
rejected — the ledger must match what actually exists.

## Why the runner's built-in `--baseline` is the safe path

`scripts/migrate.mjs --baseline 27` inserts ledger rows for steps 1..27 using
the **real checksums computed from the files on disk**, with
`ON CONFLICT (filename) DO NOTHING`, and **executes no SQL files**. This is the
runner's designed adoption path for a database that was built manually. It
records truthfully: "these file versions' effects are assumed present."

## Preconditions (all must be true)

1. **Stage B applied and verified** — `inventory_month_snapshots` and
   `inventory_audit_log` exist and match the repository definitions (Stage B
   verification queries), so steps 25/26 are genuinely equivalent.
2. **Steps 24 and 27 proven equivalent** — run Stage A sections A3/A4 and
   compare:
   - step 24 `schema-inventory-purchases.sql`: table `inventory_purchases`
     with columns `id, count_month, purchase_date, type, supplier, description,
     amount, reference, notes, cash_out_id, counted_by, created_at, updated_at`;
     indexes `idx_inv_purch_month`, `idx_inv_purch_date`, partial unique
     `uniq_gfs_invoice (type, supplier, reference) WHERE type='gfs' AND
     reference IS NOT NULL`; RLS on; policy `inv_purch_public_all`.
   - step 27 `schema-role-page-access.sql`: table `role_page_access(role, page,
     allowed, PRIMARY KEY (role, page))`; RLS on; policy `rpa_public_all`.
   If either differs, fix the divergence (or accept that the file must change
   via a new migration step) BEFORE baselining — never baseline over a mismatch.
3. **Steps 1–23 attested as applied** — production demonstrably runs the app
   against these tables today, which means the core schema exists. The baseline
   does not verify their equivalence; you are attesting to it. (Optional but
   recommended: spot-check Stage A output for the main tables from steps 1–23.)
4. **`SUPABASE_DB_URL` fixed** — the current value is a malformed password
   (26 raw characters; `@`/special characters must be percent-encoded in a
   URI, otherwise the driver sends a truncated 15-character password and
   Postgres rejects with `28P01`/`08P01`). Owner action: re-copy the URI from
   Supabase Dashboard → Project Settings → Database → Connection String → URI
   into `.env.local`. **Never paste the credential into chat, a ticket, or a
   commit.**
5. **Backup exists** — a Supabase restore point taken after Stage B.

## Exact commands (run from the repo root, after all preconditions)

```bash
# 1. Confirm the runner sees 27 pending steps and no drift (read-only).
npm run db:migrate:status
#    EXPECT: steps 1-27 all "pending"; _migrations currently has 0 rows.

# 2. Baseline: record steps 1..27 with real file checksums, execute NOTHING.
node scripts/migrate.mjs --baseline 27
#    EXPECT: output states baseline rows inserted for 27 steps; no SQL executed.

# 3. Verify the ledger now matches the manifest.
npm run db:migrate:status
#    EXPECT: all 27 steps "applied"; zero pending; zero errors.

# 4. Prove idempotency — a full run must be a no-op.
npm run db:migrate
#    EXPECT: "nothing to do" / all steps skipped; no SQL executed.
```

## Cross-check (no SQL needed)

The authoritative cross-check is step 4 above: the runner recomputes every
file checksum locally, compares it to the ledger, and would re-apply or error
on any mismatch. "Nothing to do" on a full run proves the ledger matches the
files. (A SQL-side cross-check via `pg_read_file` is not possible on Supabase
hosted — the server cannot see your local repo.)

## Do NOT

- Do not INSERT into `_migrations` by hand — the table will not exist until
  the runner creates it, and fabricated rows defeat the checksum guard.
- Do not run `--baseline` before Stage B: it would mark steps 25/26 applied
  while the tables are missing, and a later legitimate migration touching
  those files would be silently skipped.
- Do not use `--force` on anything during this deployment.
