# Manual Supabase SQL Editor Deployment Package

For the production project managed via Supabase Dashboard → SQL Editor.
Package prepared at commit `6af2238` + the audit-integrity code fix (see
"Application changes" below). **No stage of this package has been executed
against production.** Nothing here claims production readiness.

| File | Purpose | Run now? |
|------|---------|----------|
| `stage-a-preflight.sql` | Read-only inspection of live schema, RLS, grants, counts, ledger | ✅ yes |
| `stage-b-missing-schema.sql` | Creates the two missing tables (repo steps 25 + 26) | ✅ yes, after Stage A review + backup |
| `stage-c-anon-security-BLOCKED.sql` | Removes anon access to inventory tables | ❌ **BLOCKED** (see below) |
| `stage-d-ledger-reconciliation.md` | `_migrations` ledger adoption via the repo runner | ❌ **BLOCKED** (see below) |

## Run order

1. **Backup first.** Supabase Dashboard → Database → Backups: confirm a
   restore point exists (or take one). Recovery has never been tested here —
   do not skip this.
2. **Stage A** — paste `stage-a-preflight.sql` into SQL Editor and run it.
   Save the output. Review against expected results (below). Two things to
   confirm before Stage B:
   - `inventory_month_snapshots` and `inventory_audit_log` are **absent**
     (or, if present, their columns exactly match Stage B's guard list —
     otherwise Stage B will abort by design).
   - Existing inventory row counts are noted for the post-Stage-B
     comparison.
3. **Stage B** — paste `stage-b-missing-schema.sql` and run it as a whole.
   It wraps everything in one transaction: either both tables are created and
   verified, or nothing changes. Re-running is safe (fully idempotent).
   Run the B3 verification section (included in the same file) and compare
   with the expected results below.
4. **Stage D** — after Stage B is verified and `SUPABASE_DB_URL` is fixed
   (owner action: re-copy the URI from Dashboard → Project Settings →
   Database → Connection String → URI into `.env.local`; the current value's
   password is malformed and never paste it into chat). Then follow
   `stage-d-ledger-reconciliation.md`: `npm run db:migrate:status` →
   `node scripts/migrate.mjs --baseline 27` → status → full `npm run
   db:migrate` as an idempotency proof.
5. **Stage C** — do not run. See the blocker list inside the file. It becomes
   runnable only after a server-only service-role client exists and every
   inventory write path has moved off the browser anon client.

## Verification — expected results

### Stage A (read-only)
- **A1**: rows for `inventory_purchases`, `inventory_counts`,
  `inventory_items`, `inventory_month_summary`, `role_page_access`;
  **no rows** for `inventory_month_snapshots`, `inventory_audit_log`,
  `_migrations`.
- **A2**: 0 rows (the two target tables are absent).
- **A5**: all five existing tables show `rls_enabled = true`.
- **A6**: permissive `*_public_all` policies exist on every table — this is
  the documented anon-access vulnerability.
- **A7**: `anon` has broad grants on every inventory table — same finding.
- **A8**: the five row counts, recorded for the Stage B comparison.
- **A9**: NOTICE `LEDGER: public._migrations does NOT exist`.

### Stage B
- **B3.1**: exactly 2 rows (both new tables).
- **B3.2**: 15 columns on `inventory_month_snapshots`; `count_month` is the
  text primary key; `status` has the `('finalized','draft')` CHECK.
- **B3.3**: 8 columns on `inventory_audit_log`; `id` is a bigint PK with a
  sequence default.
- **B3.4**: 2 primary keys + 1 CHECK constraint.
- **B3.5**: `idx_inv_audit_month` present.
- **B3.6**: both tables `rls_enabled = true`; policies `ims_public_all` and
  `ial_public_all`.
- **B3.7**: identical counts to Stage A A8 — existing data untouched.
- **B3.8**: both new tables are empty (0, 0).

### Stage D
- `db:migrate:status` before baseline: 27 pending.
- After `--baseline 27`: 27 applied, 0 pending.
- `npm run db:migrate` afterwards: "nothing to do" — the ledger matches the
  files (this is the checksum proof; checksums are computed by the runner,
  never hand-written).

### Stage C (when unblocked)
- SQL: zero `anon` grants and zero `*_public_all` policies on the seven
  tables.
- **Required, in addition:** direct anon REST probes via curl must return
  401/403 for both SELECT and INSERT (exact commands are in
  `stage-c-anon-security-BLOCKED.sql` section C4.2). Catalog checks alone do
  not prove the fix.

## Do NOT run until…

- **Stage B**: until a Supabase backup/restore point exists and Stage A
  output shows the two tables absent (or provably compatible).
- **Stage C (C3 block)**: until ALL of: a service-role key exists in
  server-only env; a `server-only`-guarded server client module exists; every
  inventory API route uses it; the month-end page's direct browser writes to
  `inventory_counts`/`inventory_items`/`inventory_month_summary` have moved
  behind BTB-cookie-checked API routes; workflows re-tested; and anon REST
  read+write probes verified denied.
- **Stage D / any `db:migrate`**: until Stage B is verified AND
  `SUPABASE_DB_URL` is corrected. Never run the runner before baselining —
  with an empty ledger it would re-execute steps 1–23, including
  `seed-demo.sql`, against production.
- **Never** `--force`, never hand-INSERT into `_migrations`, never run
  `fix-rls.sql` or any migration file ad hoc in SQL Editor outside this
  package.

## Application changes (in this repo, not yet deployed)

Audit-integrity fix for finalize/reopen:

- `src/lib/inventory-audit-persist.ts` (new) — `persistWithAudit`: checks the
  audit insert's error; on failure runs a compensating rollback; returns a
  distinct unrecovered outcome if rollback also fails. Explicitly **not**
  atomic (two independent PostgREST requests); a Postgres RPC is deferred
  because it would have to be granted to `anon` today (no service-role key
  exists), which would let anon-key holders bypass the BTB cookie check.
- `src/app/api/btb/inventory-finalize/route.ts` — snapshot write + audit write
  via the helper; rollback deletes the just-created snapshot (first finalize)
  or restores the prior reopened draft (re-finalize); returns 500 on audit
  failure instead of false success.
- `src/app/api/btb/inventory-reopen/route.ts` — same pattern; rollback
  restores the prior finalized snapshot fields.
- `tests/inventory-audit-persist.test.ts` (new) — regression tests simulating
  audit-insert failure on both flows, rollback failure, and snapshot-write
  failure.

Evidence: 225/225 automated tests pass (217 existing + 8 new),
`npx tsc --noEmit` clean, `npm run build` clean. These are local checks —
they do not verify live production behavior.
