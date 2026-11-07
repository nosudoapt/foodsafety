# Between The Buns — final implementation handoff

**Status: Batch 1 and Batch 2 committed and green (`npm test` 356/356, `tsc` clean, `eslint` clean).**

This file is the authoritative handoff for the BTB work. Read it first, then `git log
--oneline -5`, then `git status --short`. Nothing here is deployed: **do not deploy
without explicit approval from the client.**

---

## 1. What the client asked for

Finish the existing Between The Buns Next.js restaurant platform so these workflows are
genuinely implemented, server-authorized, location-isolated, tested and usable — not SQL
groundwork or placeholder screens:

- operational checklists (opening / closing / cleaning)
- equipment temperature readings in **Celsius** at **11:00, 16:00 and 20:00**
- **separate** sanitizer **PPM** logs (never the same column, never a fake zero)
- inventory / food cost: reviewed invoice, receipt and POS extraction, duplicate
  prevention, case and packet costing, complete-period finalization
- `COGS = opening + purchases − closing`
- `Food Cost % = COGS / Net Sales × 100`
- never treat missing information as zero
- designer / marketing: manager request → corporate approval/rejection → designer
  assignment and versioned artwork → location
- designers must never bypass corporate approval or work on unapproved promotions
- email: timezone-aware combined daily PDF, configurable recipients, reliable retries and
  delivery logs
- private compliance documents, confirmed renewal history, 60/30-day reminders
- in-app notifications independent of email渭
- corporate dashboard with real multi-location drill-downs

Roles are separate and enforced **server-side / API / database**: Staff, Supervisor,
Manager, Designer, Corporate, Owner. Managers are isolated to their assigned locations.

---

## 2. Repository reality (audited, not assumed)

- Git root: `/Users/nitpreetsingh/Documents/GitHub/FoodSafeHere/foodsafety`
  (the parent `FoodSafeHere` directory is **not** a repo).
- Next.js App Router + TypeScript + Supabase (PostgREST) + Tailwind utility shim over a
  bespoke porcelain/plum design system in `src/app/*.css`.
- Authentication is BTB's own signed cookie + scrypt password hash stored in
  `btb_employees` / `btb_employee_credentials`. **There is no Supabase Auth session** — every
  route uses the privileged server client and re-checks authorization itself.
- Production migrations are applied **by hand in the Supabase SQL Editor** from
  `supabase/schema-*.sql` runbooks. `db:migrate` is not the production path.

### Committed

| Commit | Contents |
| --- | --- |
| `801b975` | Batch 1: `designer` + `owner` roles, `platform` feature in `BTB_FEATURES`/`BTB_MATRIX`, marketing/branding groups, legacy privilege-escalation fix, `btbEmployeeIsLocationManaged`, role/access tests. |
| *(this commit)* | Batch 2: personal-session platform API (`/api/btb/platform/*`), the location workspace UI at `/between-the-buns/platform`, workspace CSS, guard-test extension. |

### Not committed until the batch commit lands

Six additive SQL releases in `supabase/`:

| File | Adds |
| --- | --- |
| `schema-btb-platform-foundation.sql` | `btb_platform_actors`, `btb_location_settings`, `btb_location_access`, `btb_events`, `btb_file_objects`, `btb_notifications`, `btb_email_jobs`, `btb_platform_assert()`, settings + file-put + outbox RPCs, RLS/deny grants. |
| `schema-btb-platform-operations.sql` | `btb_operation_templates`, `btb_check_revisions`, `btb_sanitizer_settings`, `btb_sanitizer_logs`, equipment/temperature widening (`location_id`, `active_from`, `slots`, `version`), `btb_platform_save_check`, `btb_platform_save_reading`. |
| `schema-btb-platform-inventory.sql` | Document imports, reviewed purchase lines, month snapshots, `btb_platform_inventory` (finalize / reopen / carry-forward), COGS + food-cost read model. |
| `schema-btb-platform-marketing.sql` | `btb_design_formats`, `btb_design_versions`, `btb_promotion_comments`, `btb_social_platforms`, `btb_platform_marketing` state machine, calendar. |
| `schema-btb-platform-automation.sql` | Compliance versions + private files, `btb_schedule_automation`, `btb_prepare_email_job`, daily-report data builder. |
| `schema-btb-platform-api.sql` | Scoped read models `btb_platform_read`, file download authorization, notification-read, corporate overview, `service_role`-only grants. |

---

## 3. Design decisions (do not silently reverse these)

1. **Personal identity required.** Every platform route resolves an *employee* id from the
   signed cookie. The five shared legacy workspaces (`BTB_ACCOUNTS`) are rejected with 401.
   A shared account has no credential version and no memberships, so location isolation
   could not be enforced — this is deliberate, not an oversight.
2. **SQL is the authorization boundary.** Browser roles (`anon`, `authenticated`) have no
   privileges. Every RPC takes `(p_actor, p_session, …)`, re-reads the employee, re-checks
   `session_version`, the capability set and location membership inside the transaction.
   The API layer never trusts an actor id, role or location from the request body.
3. **`edit ⊆ view` everywhere** in `BTB_MATRIX`, and `platform` view is all six personal
   roles while edit is `OPS_EDIT` (staff/supervisor/manager).
4. **Celsius and PPM are separate.** `temperature_records.temperature/unit='C'` with slots
   constrained to `11:00|16:00|20:00`; sanitizer lives in `btb_sanitizer_logs.ppm` with its
   own configured slots and its own `min_ppm/max_ppm`.
5. **No invented safety limits.** `min_safe_temp`/`max_safe_temp` and the sanitizer
   `min_ppm/max_ppm` are `NULL` until corporate/owner confirms them. A reading with no
   approved limit is stored with `is_safe = NULL` and rendered as "No approved limit set" —
   never as "safe", never as `0`. Only corporate/owner can set sanitizer standards.
6. **Missing ≠ zero.** `money(null)` renders "Missing". A blank reading is rejected at the
   command parser *and* stored as `NULL`. Incomplete periods cannot be finalized: the SQL
   raises unless every item has a count, every purchase has a confirmed line total, and
   sales are positive and confirmed.
7. **Manager isolation.** Capability checks are followed by entity-level membership checks
   (`btb_location_access`), so a manager with `inventory.write` on location A still cannot
   touch B. Designer memberships are the exception: they are scoped to `marketing.%`
   capabilities only, and never to an unapproved promotion.
8. **Corporate/Owner are organization-wide** in `btb_platform_assert` (they skip per-location
   membership) — that is the HQ tier, and it is why they must not be given shared accounts.
9. **Designer reads, manager writes (legacy).** The designer may view recipes/safety pages
   and the manager-owned branding + legacy marketing boards, but legacy *campaign creation*
   remains manager/corporate. Production happens only in the platform workflow.
10. **`edit ⊆ view` for `vault`** stays manager+corporate; owner does not inherit the legacy
    store-till surfaces (`cash_out`, `order_sheet`, `employees`, `vault`,
    `licence_reminders`).
11. **Private files are 3 MiB max**, MIME-allowlisted (`pdf/png/jpeg/csv`), magic-byte
    verified in the route, hashed `sha256` and stored server-side only. List responses carry
    metadata, never bytes; downloads go through `btb_platform_file_get`, which re-authorizes
    per purpose.
12. **Additive SQL only.** `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
    EXISTS`, new scoped indexes `(…, scope_key)`; legacy `location_id IS NULL` rows and the
    legacy RPC signatures keep working.
13. **Email is a leased outbox with frozen payloads.** `btb_claim_email_jobs` leases
    (`lease_token`, `lease_until`, `attempts`, `first_attempt_at`, `uncertain`), the sender is
    frozen before the first provider attempt (`btb_prepare_email_job`), retries replay the
    frozen bytes, and `btb_finish_email_job` records provider acceptance or failure with
    exponential backoff. Uncertain responses are only retried inside Resend's 23-hour
    idempotency window.
14. **`temperature_records` keeps the legacy FK.** `user_id` still references the FoodSafe
    `profiles` uploader; `recorded_by` is the BTB employee. `temperatureOwner(db)` resolves the
    uploader server-side — there is no `BTB_UPLOADER_PROFILE_ID` setting to misconfigure.

---

## 4. Ordered backlog — what is done, what is left

### ✅ Done and committed

- Batch 1 (`801b975`): roles, matrix, `platform` feature, legacy auth hardening.
- Batch 2: personal-session platform API surface + location workspace UI + guard tests.
  - `src/lib/btb-platform.ts` — shared contracts, `READING_SLOTS`, `CHECK_KINDS`,
    `PLATFORM_FILE_*`, `parseCheckCommand`, `parseReadingCommand`.
  - `src/lib/btb-platform-server.ts` — `platformActor()`, `platformRpc()`,
    `platformFailure()` (42501→403, 40001→409, missing surface→503).
  - `src/lib/btb-platform-route.ts` — `platformRoute()` same-origin + private headers.
  - `src/app/api/btb/platform/{bootstrap,read,check,reading,file,file/[id],notifications}`.
  - `src/app/between-the-buns/platform/{page,OperationsPanel,ReadingsPanel,NotificationsPanel}.tsx`
    and `src/components/btb/ChecklistCard.tsx`.

### Next up (in order)

1. **Apply the six SQL releases to production** — this is the gating step for every remaining
   feature. See §6.
2. Inventory **import review UI** (master / GFS / local receipt / POS) + PDF-text extraction
   with an optional credentialed OCR adapter. The extraction module is still a stub; do not
   claim OCR works. Review *must* be editable and reject-on-unreviewed.
3. **Email worker**: authenticated cron route that claims jobs, renders the combined daily
   PDF server-side, calls Resend, and finishes the job. Delivery log + resend UI on top of the
   existing `btb_email_jobs` read model.
4. Compliance **documents UI** (private upload/download, renewal confirmation, 60/30 reminder
   display) on top of `compliance_documents` + `btb_compliance_versions`.
5. Designer / corporate **marketing screens** (`btb_platform_marketing` transitions exist in
   SQL; there is no screen yet).
6. Corporate **multi-location dashboard** drill-downs (`btb_platform_overview` exists).
7. Location **settings UI** (`btb_platform_settings` exists).
8. Dependency audit: 11 remaining findings investigate one at a time, no blind upgrades.
9. Production build, local migration rehearsal, browser acceptance, responsive review,
   `git diff --check` — record evidence here.
10. Deploy **only after explicit client approval**.

---

## 5. Verification log

| When | Command | Result |
| --- | --- | --- |
| Batch 1 | `npm test` | 356/356 pass |
| Batch 1 | `npx tsc --noEmit` | clean |
| Batch 2 | `npx tsc --noEmit` | clean |
| Batch 2 | `npx eslint` (platform libs, routes, screens leaf) | clean |
| Batch 2 | `npm test` | **356/356 pass, 0 fail** |

---

## 6. Deployment runbook (SQL Editor)

Apply in this exact order. Each file is `BEGIN; … NOTIFY pgrst,'reload schema'; COMMIT;` —
if one fails, nothing in it is applied; fix and re-run that file only.

1. `supabase/schema-btb-platform-foundation.sql`
2. `supabase/schema-btb-platform-operations.sql`
3. `supabase/schema-btb-platform-inventory.sql`
4. `supabase/schema-btb-platform-marketing.sql`
5. `supabase/schema-btb-platform-automation.sql`
6. `supabase/schema-btb-platform-api.sql`

After 06, verify in the SQL Editor:

```sql
select proname from pg_proc where proname like 'btb_platform_%' order by 1;
select * from pg_policies where tablename in ('btb_location_settings','btb_file_objects');
```

Then insert one `btb_employees` row with `role='corporate'`, `active`, `login_enabled`,
create its credential via the existing account flow, and confirm `/between-the-buns/platform`
returns an empty location list rather than an error.

**Never** run `db:migrate*`, create `_migrations`, or replay `demo` seeds against production.
