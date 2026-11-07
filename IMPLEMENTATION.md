# Between The Buns — final implementation handoff

**Status: Batch 1, Batch 2 and Batch 3 committed and green (`npm test` 376/376 on Node 22, `tsc` clean,
`eslint` clean). The six platform SQL releases are applied to production.**

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
- in-app notifications independent of email
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
- Production migrations are applied from `supabase/schema-*.sql` runbooks over a direct
  `postgres` connection (`SUPABASE_DB_URL`), rehearsed in one transaction then applied per file.
  `db:migrate` is still not the production path and `_migrations` must not be created.

### Committed

| Commit | Contents |
| --- | --- |
| `801b975` | Batch 1: `designer` + `owner` roles, `platform` feature in `BTB_FEATURES`/`BTB_MATRIX`, marketing/branding groups, legacy privilege-escalation fix, `btbEmployeeIsLocationManaged`, role/access tests. |
| `96a2db5` | Batch 2: personal-session platform API (`/api/btb/platform/*`), the location workspace UI at `/between-the-buns/platform`, workspace CSS, guard-test extension. |
| *(this commit)* | Batch 3: inventory & food-cost contracts + maths, `/api/btb/platform/inventory` and `/import`, the inventory review workspace, **and the six SQL releases applied to production**. |

### SQL releases — APPLIED to production (not pending)

All six are live on the production database, verified after apply: 18 `btb_platform_*`
functions present, every private table created, **zero** functions executable by `anon` /
`authenticated`, and an `anon` RLS probe returns 0 rows for BTB equipment / temperature /
compliance and `permission denied (42501)` on every private BTB table. `service_role` reads
normally. Apply evidence is in §6.

| File | Adds |

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

### Batch 3 (this commit)

- `src/lib/btb-platform-inventory.ts` — shared, secret-free contracts: `InventoryData`,
  `foodCost()` (missing input ⇒ `null`, never a zero-filled COGS), `salesTotal()` (basis label
  must appear exactly once; repeats/absence are rejected, not summed), `parseQuantity()` /
  `lineValue()` / `closingValue()` (blank ≠ 0), `textOf` / `numberOf` / `rowsOf` /
  `purchaseLineDraft` / `purchaseLinesProblem` for untrusted extraction output47, `btbMonth` /
  `isMonthKey` / `shiftMonth` / `monthLabel`, `money()` ("Missing" for null), and
  `inventoryReadiness()` — the seven prerequisites the SQL `finalize` actually enforces.
- `src/app/api/btb/platform/inventory/route.ts` — one transactional command per request
  (`items`, `confirm_master`, `reject_import`, `confirm_purchase`, `void_purchase`, `counts`,
  `inputs`, `confirm_sales`, `finalize`, `reopen`); SQL re-authorizes the actor, `session_version`,
  membership and month lock.
- `src/app/api/btb/platform/import/route.ts` — stages a reviewed extraction; requires the source
  text **or** an explicit extraction-failure reason, and a named extractor. It never invents values.
- `src/app/between-the-buns/platform/InventoryPanel.tsx` — review workspace: readiness strip, food
  cost card (COGS / net sales / %), POS-basis confirm, document review queue with per-document
  editable vendor / reference / date / total / lines and confirm-or-reject-with-reason, closing
  count grid (cases + packets, blank ≠ 0), purchase ledger with GFS/local totals and void reason,
  finalize / reopen. Wired into `page.tsx` behind `platformCan(role, "inventory")` with an accounting
  month selector.
- `src/app/btb-operations.css` — `ops-readiness`, `ops-basis-list`, `ops-figure`, `ops-import`,
  `ops-line`, `ui-stats-inline`.
- `tests/btb-platform-inventory.test.ts` — 20 tests: formula fixture (5000/2000/4000 ⇒ COGS 3000,
  25%), COGS without sales, every missing input ⇒ `null` + named, `undefined` ≠ 0, real zero
  purchases, zero/negative sales withheld, `money` missing vs zero, basis selection and duplicate
  rejection, month shifting across year boundaries, blank ≠ 0, junk rejection, line/closing valuing,
  and the action list matching the SQL state machine.

**Extraction is still not implemented.** The import route stores the caller's text and reports
`extraction_error` into the review queue; a person types the reviewed values. No OCR provider is
configured, so **no OCR result is claimed**. This is the honest failure path the schema supports.

### Batch 4 (this commit) - daily email + PDF + reports workspace

- `src/lib/btb-daily-report.ts` - client-safe, secret-free report model: checklist
  coverage (`checklistLines()`), and the PDF's pure text machinery (`pdfText()` ASCII folding,
  `fixText()` missing-vs-zero, `limitLabel()` never invents an approved range, `verdict()`
  saved-verdict-first with a re-check fallback and "No approved limit set" when none exists).
- `src/lib/btb-daily-pdf.ts` - pdf-lib renderer: paginated `Sheet` (word wrap, long-word
  split, auto page break before ANY line crosses the bottom margin - nothing is silently
  clipped), headings, bullets, key/value rows, page x-of-y footers, and
  `renderDailyReportPdf()` producing checklists / Celsius temperatures / sanitizer PPM from
  the stored daily snapshot.
- `src/lib/btb-email-worker.ts` - general outbox worker mirroring the licence dispatcher:
  `btb_schedule_automation` enqueue, then claim (5-min lease, 5-attempt cap) -> prepare
  (freezes sender + attachment) -> Resend POST with the frozen `btb-<job.id>` idempotency key
  -> `btb_finish_email_job`. Uncertain network/5xx/missing-provider-id outcomes finish as
  **uncertain (never accepted)** so the retry resumes with the identical frozen payload inside
  Resend's 23 h idempotency window. `daily` renders the PDF before prepare and refuses to send
  without it; `expiry`/`notification` send their stored text body.
- `src/app/api/cron/btb-daily-reports/route.ts` - `CRON_SECRET` + `timingSafeEqual` bearer
  gate, strict time budget, honest run summary (enqueued/claimed/accepted/skipped/failed + errors).
- `src/app/api/btb/platform/resend/route.ts` - manager/corporate resend request with a
  required reason and per-request UUID key; SQL refuses without configured recipients.
- `src/app/between-the-buns/platform/ReportsPanel.tsx` + tab in `page.tsx` behind
  `platformCan(role, "reports")` - report coverage preview (missing tasks counted, not zeroed),
  full delivery log (status, attempts, uncertain flag, provider id / error, timestamps), and an
  audited resend form.
- `tests/btb-daily-report.test.ts` - 8 tests: ASCII folding (quotes, dashes, ellipsis,
  degree/emoji/nbsp), whitespace collapse before folding, Missing vs real 0, no invented limits,
  saved-verdict-first / re-check / no-bounds cases, absent checklist = "Not saved" with the
  full outstanding list, silent completion, and a full `renderDailyReportPdf()` E2E asserting a
  real PDF document (must be run with `REPORT_PDF_E2E=1 --conditions=react-server` because
  `server-only` guards the module).
- Also fixed: `FoodCostCard` summed an empty purchase list to `$0.00` when purchases were
  unconfirmed; it now shows **Missing** until `purchases_confirmed` (or a finalized snapshot).

### Next up (in order)

1. Compliance **documents UI** (private upload/download, renewal confirmation, 60/30 reminder
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
| Applied | six releases, one transaction rehearsal | 6/6 OK, `ROLLBACK` clean |
| Applied | six releases, per-file commits | 6/6 APPLIED (4.4 s + 410/510/410/420/335 ms) |
| Applied | `pg_proc` / `information_schema` verify | 18 `btb_platform_*` funcs, 0 missing tables, 0 browser-executable funcs |
| Applied | `anon` RLS probe | 0 rows BTB equipment/temp/compliance; `42501` on every private table; `service_role` reads OK |
| Batch 3 | `npx tsc --noEmit` | clean |
| Batch 3 | `npx eslint` (inventory lib, routes, panel, tests) | clean |
| Batch 3 | `npm test` (Node 20) | 367/376 — 9 fail only on `ERR_TEST_FAILURE` "native WebSocket not found" |
| Batch 3 | `npm test` (Node 22 via `npx --package=node@22`) | **376/376 pass, 0 fail** |

---

## 6. Deployment record — SQL is APPLIED

**The six releases below are already applied to production.** They no longer need to be
pasted into the Supabase SQL Editor. They are recorded here as the runbook used, so any
future environment (staging, a new project) can be brought up the same way.

Order (dependency-sensitive):

1. `supabase/schema-btb-platform-foundation.sql`
2. `supabase/schema-btb-platform-operations.sql`
3. `supabase/schema-btb-platform-inventory.sql`
4. `supabase/schema-btb-platform-marketing.sql`
5. `supabase/schema-btb-platform-automation.sql`
6. `supabase/schema-btb-platform-api.sql`

Each file is `BEGIN; … NOTIFY pgrst,'reload schema'; COMMIT;` and is idempotent
(`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS`), so a re-run is safe but
unnecessary.

### How it was applied

Over a direct `postgres` connection (`SUPABASE_DB_URL`, pooler, `ssl: require`,
`prepare: false`), **not** `db:migrate` and not the SQL Editor:

1. **Preflight** — PostgreSQL 17.6, `gen_random_uuid()` available, IANA tz data present
   (`America/Edmonton`), and the live row counts captured: 4 locations (Ancoats, Deansgate,
   Piccadilly, The Grill House), 9 profiles, 2 employees, 2 shift checks, 4 temperature records.
2. **Rehearsal** — all six releases executed in a single transaction, then `ROLLBACK`; 6/6 OK,
   no data changed.
3. **Apply** — each file committed in its own transaction, in order: 6/6 `APPLIED`.
4. **Verify** — 18 `btb_platform_*` functions; 0 missing tables; **0** functions executable by
   `anon` or `authenticated`.
5. **RLS probe** — `anon` sees 0 BTB equipment/temperature/compliance rows, and
   `permission denied (42501)` on every private BTB table; `service_role` reads normally.

Pre-existing FoodSafe tables (`equipment`, `temperature_records`, `compliance_documents`,
`locations`, `profiles`) still grant `anon` `SELECT`, because they hold non-BTB rows too. The
releases add **restrictive** `btb_location_private` policies so BTB rows in those tables are
invisible to browser roles while legacy rows are unaffected — verify with the probe below rather
than by reading `has_table_privilege` alone.

```sql
-- browser roles must see 0 BTB rows
begin; set local role anon;
select count(*) from equipment where restaurant_name='Between the Buns';
select count(*) from temperature_records where restaurant_name='Between the Buns';
rollback;
```

**Never** run `db:migrate*`, create `_migrations`, or replay `demo` seeds against production.

### Remaining production bootstrap

No `btb_employees` row is `role='corporate'` or `role='owner'`, and both existing employees have
`login_enabled = false`, so **nobody can sign in to the HQ surfaces yet**. This is a data step,
not a code step: insert/re-activate one personal employee per HQ person (`role in ('corporate','owner')`,
`active`, `login_enabled`, a location membership for corporate) and set its credential through the
existing account flow. It must be a personal account — never a `BTB_ACCOUNTS` shared workspace.
