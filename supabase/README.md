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
| 6 | `fix-rls.sql` | Corrects the `profiles` select/update policies. Run last. |

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
- **Login vault**: management tier only (secrets — treat as sensitive; see the
  `secret` column note in `schema-compliance.sql`).

Server-side route enforcement for `/admin/*` lives in
[`src/proxy.ts`](../src/proxy.ts) and mirrors these tiers.
