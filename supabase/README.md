# Database setup (Supabase)

## Migrations — `npm run db:migrate`

The files below are listed **in run order** in [`migrations.json`](./migrations.json)
and applied by `scripts/migrate.mjs`, which records each run in a `_migrations`
table so nothing is applied twice.

```bash
npm run db:migrate:dry        # plan only — works even without a DB URL
npm run db:migrate:status      # applied vs pending table
npm run db:migrate             # apply everything pending
npm run db:migrate:step -- 16  # apply up to step 16
npm run db:migrate -- --force  # re-run steps already recorded
```

1. Put the **superuser** connection string in `.env.local` (see
   [`.env.example`](../.env.example)):
   `SUPABASE_DB_URL=postgresql://postgres:…@db.<project>.supabase.co:5432/postgres`
   — Supabase Dashboard → Project Settings → Database → Connection String →
   **URI**. It is *not* the anon key; migrations create tables, policies and
   functions.
2. Applied steps are stored with their SHA-256 checksum. Already applied and
   unchanged → skipped. **Edited after it ran → the runner stops** (restore the
   file, or pass `--force` if you really meant it).
3. Each file is sent as a single statement batch, so a failure rolls that whole
   file back and the error prints the file name plus line number.
4. `NODE_ENV=production` refuses to apply without `--allow-prod`, and a missing
   `SUPABASE_DB_URL` refuses to apply at all (instead of half-working).
5. Pasting files into the SQL Editor by hand still works — both paths read the
   same files; the runner just remembers what already ran.

`tests/migrate.test.mjs` fails the build if the manifest, the `.sql` files on
disk and the numbered table below ever disagree.

### Adding a migration

1. Write `supabase/schema-<thing>.sql` — idempotent, with a header comment.
2. Append the next free `{"step": N, "file": …, "description": …}` to
   `migrations.json` **and** a row to the numbered table below.
3. `npm run db:migrate:dry` to preview, then `npm run db:migrate`.
4. Step 23 (`seed-demo.sql`) is a *reset*: it deletes and re-inserts the demo
   accounts' sample rows, so it is tracked like any other step rather than
   re-run every time. Re-seed deliberately with `npm run db:migrate -- --force`.

## Manual order (SQL Editor)

Run these files **in order** in the Supabase SQL Editor if you'd rather paste
them yourself. Each builds on the previous one, so the order matters. All files
are idempotent (safe to re-run).

| # | File | Purpose |
|---|------|---------|
| 1 | `schema.sql` | Base tables (`profiles`, core app tables), `uuid-ossp`, RLS bootstrap. |
| 2 | `schema-rbac.sql` | Document/inspection/marketing tables + their RLS. Sets an initial role CHECK. |
| 3 | `schema-roles.sql` | **Canonical** 6-role CHECK (supersedes #2's), 30-day trial column, `handle_new_user()` trigger. |
| 4 | `schema-features.sql` | Operational BTB tables (prep counts, orders, cleaning schedule). |
| 5 | `schema-compliance.sql` | Compliance register, login vault, emergency contacts, handbook, protocols, new-restaurant tasks + RLS. |
| 6 | `schema-documents.sql` | Widens `business_documents.doc_type` to cover every expiring document the vault tracks (licenses, insurance, hood/fire, pest, franchise, lease). |
| 7 | `fix-rls.sql` | Corrects the `profiles` select/update policies. |
| 8 | `schema-btb-public.sql` | **Demo-grade.** Opens the compliance/admin tables to public RLS so the cookie-authed Between the Buns surface (no Supabase session) can read/write them. NOT production row security — see the file header. |
| 9 | `schema-cleaning-photos.sql` | `cleaning_logs.done_time` + `cleaning_logs.week_start` + the public `ops-photos` Storage bucket and its policies (multi-angle cleaning photos). |
| 10 | `schema-emergency-contacts.sql` | `emergency_contacts.category` + `phone_2`/`phone_3`/`contact_name`/`email` — the category directory (Electrician, Plumber, Grease Trap…) with 3 preferences per entry. |
| 11 | `schema-locations.sql` | `locations` + `location_members`, `profiles.location_id`, `location_id` on prep/order/cleaning + the 3 dashboard-counter tables, `urgent` flag on PAR sheets, fixed-id seed + membership backfill. |
| 12 | `schema-inspection-consolidation.sql` | `corporate_inspections.inspection_type` (corporate / in-house / franchisee share one table), backfills legacy `inhouse_inspections` rows, opens the table to the BTB tablet. |
| 13 | `schema-prep-sheet.sql` | `prep_counts.pull` — the Freezer pull & Dairy column of the new Daily Prep Sheet. Run last: until it's run the sheet still reads, but Save refuses with a message naming this file. |
| 14 | `schema-marketing-fields.sql` | `marketing_promotions.category` / `size` / `person_name` / `location_id` — the promotion form's category, size, person and target site. Needs `locations` from #11; until it's run the marketing board hides those four inputs. |
| 15 | `schema-vault-categories.sql` | Widens `login_vault.category` to the Login Vault's flat category list (Debit machine, Internet, MYR POS, Bank login, Uber …) while keeping every legacy bucket readable. Keep in sync with [`src/lib/vault-categories.ts`](../src/lib/vault-categories.ts). |
| 16 | `schema-cash-out.sql` | `cash_outs` — end-of-day till reconciliation (till, cash sale, delivery fees, tips, cash-out, safe drop) with a 30-day retention purge (`purge_cash_outs()`). |
| 17 | `schema-staff-schedule.sql` | `staff_members` + `staff_shifts` — weekly roster calendar (90-day retention on shifts via `purge_staff_schedule()`). Needs `locations` from #11. |
| 18 | `schema-tax-dates.sql` | `corporate_dates` — filing deadlines, payroll remittances, licences and renewals with optional monthly/quarterly/annual recurrence. `location_id IS NULL` = company-wide. Kept forever (a purged deadline would silently vanish from next year's view). |
| 19 | `schema-training.sql` | `training_topics` + `training_sections` — the SOP/onboarding guide (sections are plain text: paragraphs + `- ` checklist lines, `published` hides drafts from staff). Kept forever. |
| 20 | `schema-month-end-inventory.sql` | `inventory_items` + `inventory_counts` — the closing count sheet (`count_month` is a `YYYY-MM` key, one row per item per month) with value and variance against the previous close. Retention: 24 months via `purge_inventory_counts()`. |
| 21 | `schema-branding-requests.sql` | `branding_requests` — signage/menu/uniform/packaging requests on a status board (open → in_review → in_progress → done/declined). Retention: finished requests older than 24 months via `purge_branding_requests()`; open work is never purged. |
| 22 | `schema-storage-buckets.sql` | Storage buckets `cleaning-photos`, `inspection-photos`, `training-videos` + their policies (upload targets for `uploadToSupabase()` in `src/lib/files.ts`). Existing cleaning/inspection photos stay in `ops-photos` (#9). |

## Role set — single source of truth

The 6 RBAC roles (`staff`, `manager`, `owner`, `multi_location_owner`,
`corporate`, `designer`) are defined in [`src/lib/roles.ts`](../src/lib/roles.ts)
and mirrored by the `profiles_role_check` constraint. `schema-roles.sql` (step 3)
holds the authoritative CHECK; keep it in sync with `roles.ts`. `supervisor` was
removed — do not reintroduce it.

## RLS tiers

- **Read** on operational/compliance tables: any signed-in user.
- **Write** on compliance/admin tables: management tier
  (`owner`, `multi_location_owner`, `corporate`, `manager`).
- **Login vault**: owner tier only (`owner`, `multi_location_owner`,
  `corporate`) — mirrors `OWNER_TIER_ROLES` in `roles.ts`, the `/admin/vault`
  nav tier and `proxy.ts`. Secrets are AES-256-GCM encrypted at rest by the
  app before insert, and are only ever decrypted in a server route handler.

## Login vault secrets

`login_vault.secret` is written as ciphertext (`v1:<iv>:<tag>:<ct>`) by
[`src/lib/vault-crypto.ts`](../src/lib/vault-crypto.ts). The browser never
selects that column:

| Endpoint | Purpose |
|---|---|
| `GET /api/vault` | List entries — returns `hasSecret`, never the value. |
| `POST /api/vault` | Create; encrypts `secret` server-side. |
| `POST /api/vault/reveal` | Decrypt one entry (owner-tier session required). |
| `POST /api/vault/harden` | Encrypt any pre-existing plaintext rows. |

Requires `VAULT_ENC_KEY` (base64 32-byte AES key) in `.env.local`. Generate
with `openssl rand -base64 32`. Without it the vault endpoints return a clear
500 rather than silently storing plaintext. Rows created before encryption
still decrypt — `decryptSecret` passes legacy plaintext through unchanged.

Server-side route enforcement for `/admin/*` lives in
[`src/proxy.ts`](../src/proxy.ts) and mirrors these tiers.
