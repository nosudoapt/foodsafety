# Database setup (Supabase)

## Current production release

The connected production project uses **SQL Editor releases without a migration
ledger**. For BTB team operations, uploads and email configuration, follow
[`deploy/BTB_DASHBOARD_SETUP.md`](../deploy/BTB_DASHBOARD_SETUP.md): install
`schema-btb-team-operations.sql`, then `schema-btb-uploads.sql`, and run the
read-only release check. The migration runner and full historical setup below
are for separately managed/new installations.

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
| 24 | `schema-inventory-purchases.sql` | `inventory_purchases` — the daily purchase ledger (GFS invoices + local purchases) that feeds monthly COGS. One source of truth for eligible purchases; a unique index blocks duplicate GFS invoice references. |
| 25 | `schema-inventory-snapshots.sql` | `inventory_month_snapshots` — server-written month-end accounting snapshot (opening/purchases/closing/sales/COGS/food-cost %). Rows are never deleted; reopening flips `status` to `draft` and records who/why so history is preserved. |
| 26 | `schema-inventory-audit.sql` | `inventory_audit_log` — append-only trail of finalize/reopen/correct actions with a JSONB copy of the figures at action time. |
| 27 | `schema-role-page-access.sql` | `role_page_access` — admin-edited role→page matrix the BTB hub reads to decide which cards each role sees. The Admin Dashboard writes it. |
| 28 | `schema-inventory-master-list.sql` | The 278 item names from `reference-documents/Master Inventory-October 1.numbers`, seeded once with `protected = true`. A trigger makes the list **append-only**: master names cannot be deleted or renamed (a rename is a deletion); `unit`, `category` and `unit_cost` stay editable. Generated by [`scripts/extract-master-inventory.py`](../scripts/extract-master-inventory.py). |
| 29 | `schema-november-13-updates.sql` | 13 Nov 2026 updates — branding: `qty` + `items` columns for combo requests; shifts: duty CHECK accepts `prep` and `none` (duties optional); compliance: `notify` reminder toggle column. |
| 30 | `schema-platform-admin.sql` | Platform admin — `app_activity` page-visit tracking (recently/most used links, owner heatmap) and `platform_plans` client billing rows. |
| 31 | `schema-compliance-second-attachment.sql` | Compliance renewals — second attachment slot (`other_file_name` / `other_file_url`) beside the renewal certificate. |
| 32 | `schema-btb-superadmin.sql` | Separate BTB super-admin credentials and managed locations, 50 MiB storage cap, location page allow-lists. Requires the existing BTB team and location platform releases. |
| 33 | `schema-btb-invitations.sql` | One-time person invitations, existing employee credential activation, request-time multi-location page grants. |
| 35 | `schema-btb-admin-monitoring.sql` | Console monitoring RPC over managed locations (counts, storage, activity heatmap, recent events, operational health: open shifts, problems, today's checks/readings, AI use) plus the atomic per-location aggregate storage cap on platform file uploads. |
| 36 | `fix-offline-replay-keys.sql` | OFF-06 offline replay keys — `btb_offline_receipts`, `btb_insert_temp_record` and `btb_replay_prep_save`. Prerequisite for step 37. |
| 37 | `fix-btb-page-capabilities.sql` | Live page-scoped browser capabilities, effective grants at RLS/RPC boundaries, server-only role restrictions and platform grant revalidation. Runs after 36 because it wraps `btb_replay_prep_save`. |
| 38 | `schema-btb-training-audience.sql` | `training_topics.audience` — whole-team modules vs manager-only modules. Week 4 manager training is reviewed by an owner. |
| 39 | `seed-btb-training-modules.sql` | The four-week onboarding programme (Weeks 1–3 all staff, Week 4 manager-only) as published topics and sections. Idempotent by fixed id. |
| 40 | `schema-btb-manager-invites.sql` | Managers and supervisors invite their own team from the workspace: employee-issued single-use invitations, branded setup email, no console password required. |
| 41 | `schema-btb-location-slugs.sql` | Unique location slugs (`/btb/drumheller`), backfilled from names; console create/update keeps them valid and reserved words (`demo`, `login`, `admin`, `api`, `btb`) are refused. |
| 42 | `schema-btb-admin-password-reset.sql` | Console super-admin password reset without email: salted hash, session revocation, invitation cancellation, and an audit event. |
| 43 | `schema-btb-platform-time.sql` | Location time clock: shifts, punches, corrections, manager approval and approved-hours export. |
| 44 | `schema-btb-platform-finance.sql` | Location finance: invoices, stock receipts, supplier price history, bank reconciliation and GST periods. |
| 45 | `schema-btb-platform-ai.sql` | AI document extraction settings and usage metering; the extractor only prefills the review queue. |
| 46 | `schema-btb-manager-settings.sql` | A branch manager may configure their own location settings, including the AI extraction key; corporate/owner keep organization-wide reach. |
| 47 | `schema-cash-out-extras.sql` | Cash-out wastage (item, quantity) and staff-meal (staff, item, quantity) lines; till totals are unchanged. |
| 48 | `schema-temperature-photos.sql` | Optional photo evidence on an off-form temperature reading. |
| 49 | `schema-btb-task-assignments.sql` | Per-person daily duties (temperature, prep, opening, closing, cleaning) and the incomplete-task marker on clock-out. |
| 50 | `schema-btb-clock-policy.sql` | On-site clock-in policy: server geofence, restaurant IP/CIDR allowlist, device binding and an audit of every attempt. |
| 51 | `schema-btb-auth-hardening.sql` | Sign-in hardening: failures only counted, cleared on success, per-IP throttle, and 30 days of attempt history for the console. |
| 52 | `schema-btb-location-scope.sql` | Branch isolation for the daily tools: temperature standards and order sheets gain a location, and location-aware writers replace the restaurant-wide ones so one branch cannot read or change another's temperature log, checklists, order sheet or staff schedule. |
| 53 | `schema-btb-prep-sheet.sql` | Prep sheet workflow: per-branch weekly PAR levels, section assignments, autosaved drafts, submissions with in-app manager notices, comments and 45 days of history. |
| 54 | `schema-btb-edit-log.sql` | Field-level audit of prep and order sheet changes, branch scoped and readable only by owner, supervisor and corporate. |
| 55 | `schema-btb-inventory-location-scope.sql` | Month-end inventory per branch: legacy rows backfilled to Drumheller, branch-scoped indexes and uniqueness, and a seed helper so a new branch gets its own copy of the item list. |
| 56 | `schema-btb-cleaning-cashout-server.sql` | Cleaning schedule and cash-out move behind server endpoints: branch and week columns on cleaning_logs, one till count per branch per day, and browser writes revoked on cleaning_logs, cash_outs, prep_counts and order_sheets. |
| 57 | `schema-workspace-auth-cutover.sql` | Unified auth prerequisites: canonical tenants/principals, linked collision credential archives, protected signup/profile privileges, explicit console assignments, durable limits and revocable sessions. Unresolved legacy ownership stays unassigned. Apply once through the checksum-tracked runner. |
| 58 | `schema-workspace-session-scope.sql` | Request-bound SQL and atomic session switching; owner/corporate/console roles still require explicit same-tenant assignments. Retires browser bearer tokens and raw data/RPC access. Adds nullable scope columns without legacy backfills. |
| 59 | `schema-btb-console-locations-fix.sql` | Repair the console location list: `btb_admin_locations()` no longer reads a `created_at` column that `workspace_console_locations` does not have, and lists every location in the console's tenant instead of only the current branch. |
| 60 | `schema-btb-console-monitoring-tenant.sql` | Console monitoring covers the whole tenant: one `btb_console_site_ids()` helper now feeds the site list, people count, activity heatmap and recent feed, so `locations`/`active_locations` and every per-branch aggregate report the real estate instead of one pinned branch. |


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
