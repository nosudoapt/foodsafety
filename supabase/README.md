# Database setup (Supabase)

Run these SQL files **in order** in the Supabase SQL Editor. Each builds on the
previous one, so the order matters. All files are idempotent (safe to re-run).

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
