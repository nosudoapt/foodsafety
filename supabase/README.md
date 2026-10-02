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
| 9 | `schema-cleaning-photos.sql` | `cleaning_logs.done_time` + `cleaning_logs.week_start` + the public `ops-photos` Storage bucket and its policies (multi-angle cleaning photos). Run last. |

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
