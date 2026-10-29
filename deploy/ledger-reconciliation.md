# Migration-Ledger Reconciliation (documented runner command — no SQL to paste)

**Status: OPTIONAL for the prototype; safe only after 03-verify.sql passes and
`SUPABASE_DB_URL` is corrected.** Nothing here is SQL for the SQL Editor — the
ledger must be created by the repository's own runner (`scripts/migrate.mjs`),
because only the runner knows the exact ledger DDL and checksum algorithm.

## What the runner's `--baseline 27` actually does (verified in source)

`scripts/migrate.mjs` lines 102–113 / 235–263:

- creates `_migrations` if absent (`CREATE TABLE IF NOT EXISTS`);
- computes each checksum **from the file on disk at run time** (CRLF-normalized
  SHA-256) — never from the manifest, never fabricated;
- inserts one ledger row per step 1..27 (`ON CONFLICT (filename) DO NOTHING`,
  `duration_ms = 0`);
- **executes no SQL files and validates no schema** — it only records.

Because it records current file checksums, a later `npm run db:migrate` skips
all 27 steps — including steps whose effects were never actually applied.
That's why equivalence must be established first (03-verify.sql sections
3.9–3.11).

## Why not hand-write ledger rows

A partial or fabricated ledger makes the runner re-execute unrecorded steps on
a future run — steps 1–23 include `seed-demo.sql`, which **resets demo data**.
Never INSERT into `_migrations` by hand; the table won't even exist until the
runner creates it.

## Preconditions

1. **03-verify.sql passes** — the two new tables match the repo definitions,
   steps 1–22 base tables all exist (3.9 returns 0 rows), steps 24/27 shapes
   match (3.10/3.11), and row counts are unchanged (`role_page_access` = 67).
2. **`SUPABASE_DB_URL` fixed** — re-copy the URI from Supabase Dashboard →
   Project Settings → Database → Connection String → URI into `.env.local`.
   (The stored value's password is malformed: raw special characters must be
   percent-encoded in a URI. Never paste the credential into chat/tickets.)
3. **Awareness:** the runner's `--status` also creates the empty `_migrations`
   table if missing — the first (benign) production change by the runner.

## Commands (repo root, when ready)

```bash
# 1. Preview (read-only apart from creating the empty _migrations table):
npm run db:migrate:status
#    EXPECT: steps 1-27 all pending.

# 2. Record steps 1..27 with real file checksums — executes NOTHING:
node scripts/migrate.mjs --baseline 27
#    EXPECT: "baseline: steps 1–27 marked applied … nothing executed."

# 3. Verify the ledger matches the files:
npm run db:migrate:status          # EXPECT: all applied, 0 pending
npm run db:migrate                 # EXPECT: "nothing to do" (checksum proof)
```

## Do NOT

- Do not run `npm run db:migrate` (without baseline) against production —
  with an empty ledger it would execute steps 1–27, including seed-demo.sql.
- Do not baseline before 03-verify passes.
- Do not use `--force`.
