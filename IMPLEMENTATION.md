# Between the Buns — platform implementation record

Updated: 2026-11-06. This is the persistent implementation checklist and handoff.

## Current status (2026-11-06, batch 1)

**Full suite: 356/356 passing, `tsc --noEmit` clean, ESLint clean on changed files.** No production writes, no deployment.

Batch 1 completed: legacy authorization hardening and role-matrix integration.

- `src/lib/btb-access.ts` — Designer and Owner integrated into the feature matrix.
  Owner is an organization super-admin but deliberately does **not** inherit legacy
  store-till surfaces (`cash_out`, `order_sheet`, `employees`, `vault`,
  `licence_reminders`); `franchise_inspection`, `new_restaurant`, `marketing`,
  compliance/documents/staff-licenses are Corporate+Owner. Designer reads
  recipes (`reference`), safety pages, the manager-owned branding board and the
  legacy marketing board, but cannot create legacy campaigns — design production
  stays inside the platform workflow (Manager → Corporate → Designer → Manager).
  `marketing` view includes designer, edit does not: `edit ⊆ view` still holds.
- `src/app/api/btb/employees/route.ts` — **privilege-escalation fix**: approach
  legacy manager who is not a member of the location platform could previously
  reset the password, change the role or deactivate a location-managed employee
  (their own account included). Now blocked for non Corporate/Owner actors,
  including self-edits; Corporate/Owner keep organization-wide reach.
- `src/lib/btb-api.ts` — added `btbEmployeeIsLocationManaged()`; fails closed on
  unexpected errors, degrades to legacy-only on a missing release-06 table.
- Tests updated to pin the intended invariants rather than stale role lists:
  `tests/btb-auth.test.ts` (5 legacy shared accounts, designer/owner have **no**
  shared password account), `tests/btb-access.test.ts` (designer can read,
  never edit, reference), `tests/server-db-clients.test.ts` (route guard accepts
  the hardened `legacyBtbRole` alias).

### Verified

- `npm test` → **356/356 pass** (exit 0).
- `npx tsc --noEmit` → no output.
- `npx eslint` on changed files → no output.
- Dependency audit is unchanged at **11 findings (8 moderate, 3 high)**, pending investigation.

### Not yet done (unchanged from handoff below)

The six SQL releases are still **unreachable from the application**: there are no
platform API routes, no UI screens and no PDF/OCR/email dispatch worker. This is
the next implementation batch (operations vertical slice).

## Budget stop — current handoff (2026-11-06)

Implementation paused at the client's request. **The new platform is not release-ready, has not been deployed, and has no connected new platform UI/API routes yet.** All implementation changes remain uncommitted. No production data or schema was written.

### Work added since the original audit

- Six additive SQL release files: `schema-btb-platform-{foundation,operations,inventory,marketing,automation,api}.sql`.
- Personal Designer/Owner role definitions, location memberships/settings, actor/session/capability checks, private file registry, audit events, in-app notifications, leased email outbox.
- SQL workflows for configurable opening/closing/cleaning, attributed revisions, equipment Celsius readings and separate PPM readings; approved limits remain configurable and unset.
- SQL inventory review records, case/packet costing, duplicate protection, complete-period close, saved sales basis, immutable snapshot contents, reopening and carry-forward. Undated unreviewed imports now block their assigned accounting month. Master confirmation and import rejection commands added.
- SQL promotion approval/assignment/production/version history/feedback and calendar approval; designers cannot work on unapproved requests or take another designer's assigned work.
- SQL compliance revisions and explicit expiry confirmation; timezone-based daily report scheduling, 60/30 reminders, frozen retry sender/attachment preparation, superseded-reminder checks, private download authorization and scoped read models.
- Began legacy compatibility/security integration: NULL-location filters in checklist, inventory, marketing and social APIs; scoped snapshot conflict keys; membership-based legacy API restrictions; legacy dashboard filters and retention protection. **These application changes are not regression-verified yet.**
- Installed PDF libraries and moved `pdfjs-dist` to runtime dependencies. Updated Next.js and its ESLint config to 16.4.5 after the audit identified a critical advisory in 16.3.5. Latest install audit: **11 findings (8 moderate, 3 high)**; transitive remediation remains.

### Verification actually run

- Baseline full suite before implementation: **347/347 passed**.
- Foundation suite: **4/4 passed**; operations suite: **1/1 passed**.
- `tests/btb-platform-workflows.test.mjs`: **3/3 passed**, exercising inventory review/duplicates/close/carry-forward/reopen, request-to-artwork/calendar approval, and timezone scheduling/private compliance/renewal/frozen retry preparation in PGlite.
- Those results precede the latest `compliance_types` settings/read-model additions and legacy application edits. **No final full-suite, types, lint, build, browser or live-service verification has run.**

### Next implementation priorities

1. Rerun SQL suites after the latest settings changes; finish authorization/rollback/rejection coverage and inspect legacy employee administration so unassigned legacy managers cannot reset credentials of location-assigned employees.
2. Implement personal-session platform API wrappers, bounded command validation, magic-byte/size validation and authorized binary downloads. Wire all existing SQL commands to those routes.
3. Implement actual PDF-text/OCR extraction, editable source review and master/POS/invoice imports. No extractor or OCR adapter exists yet.
4. Implement combined-PDF generation, Resend dispatch worker and authenticated cron route. SQL queues currently do not send email.
5. Build/integrate the role-specific location workspace, designer screen, operations forms, inventory review/counts, marketing/calendar, compliance, settings and corporate overview. Add account provisioning.
6. Complete legacy compatibility, meaningful API/browser acceptance, dependency fixes, full regression/types/lint/build/diff checks, SQL Editor deployment runbook and final evidence report.
7. Obtain the five missing reference files, confirmed locations/settings/recipients and external service credentials. Reconcile real documents and verify real inbox delivery only after these are supplied.

The phase checklist below remains an end-to-end checklist: SQL implementation alone does not mark an application workflow complete.

## Phase 0 — verified audit

- [x] Locate actual Git repository (`foodsafety/`); preserve untracked `.claude/` work.
- [x] Read AGENTS.md and installed Next 16.3.5 route/server-component guides.
- [x] Map frontend, APIs, authentication, SQL, storage, automation and deployment.
- [x] Run baseline: **347/347 unit/database tests pass** (2026-11-06).
- [x] Read-only connected database inspection through PostgREST.
- [ ] Direct production catalog/RLS verification: DB connection timed out. No production writes performed.
- [ ] Inspect five reference documents: **absent**; requested from client. Add to `reference-documents/` (not public web assets).

### Architecture discovered

Next.js App Router + React 19 + TypeScript + Tailwind 4; porcelain/plum BTB UI, DM Sans/DM Serif Display, shared dialogs/controls. Two independent authentication surfaces: FoodSafe Supabase Auth and BTB signed HTTP-only cookies. BTB personal accounts use server-side scrypt credentials, 12-hour signed/versioned sessions and database login limits. Shared legacy role accounts also exist; they must not authorize the new location platform. Existing supervisor role is retained.

BTB APIs are Next route handlers under `src/app/api/btb/`. The server-only Supabase service client is `src/lib/supabase-server.ts`. `btb-api.ts` revalidates personal accounts and role/page access. Existing BTB roles: staff, supervisor, manager, corporate, admin. No BTB designer or separate owner account tier existed. FoodSafe has a designer role but cannot be reused as a BTB session.

### Existing module/database/API map

| Workflow | Existing entities | API / frontend | Verified gap |
|---|---|---|---|
| Accounts & access | btb_employees, btb_employee_credentials, btb_login_limits, role_page_access | login, me, account, employees, role-page-access | No BTB employee/location memberships; shared credentials unsuitable for production location access |
| Locations | locations, location_members (FoodSafe profile FK) | FoodSafe LocationSwitcher | Reuse locations; BTB employees require their own FK membership |
| Opening/closing | btb_shift_checks, btb_check_revisions; legacy btb_checklists retained | checklists | Attributed/revisioned but company-wide, fixed templates |
| Rosters/orders/training | btb_shifts, btb_order_sheets/revisions, training_topics/sections, btb_training_records/reviews | staff-schedule, orders, training/* | Existing workflows preserved |
| Cleaning | cleaning_logs; original 11 tasks in btb-cleaning.ts | cleaning-schedule (browser Supabase) | Weekly legacy logs; configurable daily completion needed |
| Temperature | equipment, temperature_records | temperatures, btb-temperature-store.ts | Existing independent readings, 90-day history; no scheduled equipment matrix or sanitizer |
| Inventory | inventory_items, inventory_counts, inventory_purchases, inventory_month_summary, inventory_month_snapshots, inventory_audit_log | inventory-items/counts/purchases/summary/opening/snapshot/finalize/reopen/health | Company-wide month PK, no OCR/POS import, incomplete periods can finalize; snapshot/audit uses compensating writes rather than DB transaction |
| Marketing | marketing_promotions, social_media_calendar; branding_requests for physical branding/T-shirts | marketing, social-posts; MarketingBoard | Uploads/calendar exist; no request approval/assignment/version lifecycle |
| Documents/compliance | business_documents, compliance_documents, btb_staff_licences; legacy staff_licenses | documents, staff-licences, licence-reminders | Missing per-location recipients, renewal history and 60-day window |
| Email | btb_notification_settings, btb_licence_email_log; btb-email.ts | cron/btb-licence-reminders | Resend integration exists; no daily combined PDF; fixed Regina timezone, existing 30/7/1/0 reminders |
| Storage | Existing DB data URLs plus public ops-photos/cleaning/inspection/training buckets | btb-uploader.ts and files.ts | New sensitive files need a private, authorized file boundary |
| Notifications | No unified notification entity | Dashboard counters only | Durable personal in-app notifications and general outbox needed |

### Connected database evidence (read-only, 2026-11-06)

REST count queries (`limit=0`, service credential kept private): locations **4**; btb_employees **2**; btb_shift_checks **2**; btb_notification_settings **1**; temperature_records **4**. All six inventory ledger/count/summary/snapshot/audit/catalog tables **0**. marketing_promotions, social_media_calendar, branding_requests, compliance_documents, cleaning_logs, btb_staff_licences and btb_licence_email_log **0**. Existing site names are demo seed data, not confirmed BTB branches; do not map them to Drumheller automatically.

`SUPABASE_SERVICE_ROLE_KEY` configured. `RESEND_API_KEY`, `BTB_EMAIL_FROM`, `CRON_SECRET` absent. No mail delivery or live OCR evidence. Production uses SQL Editor/runbooks, **not** `db:migrate` / `_migrations`; old manifest includes destructive demo seeds and must not be applied wholesale.

## Architecture decisions

1. Extend existing relational entities and existing personal BTB login. Add designer/owner roles and explicit employee/location membership. Location platform access requires a personal identity; legacy workspaces cannot enter it.
2. Keep legacy NULL-location records intact. New location records never become company-wide data implicitly. Every platform command verifies actor + location + capability in the API and transactional SQL. New private tables/RPCs deny browser roles.
3. Reuse marketing_promotions/social_media_calendar, inventory ledgers/snapshots, shift checks, temperature_records, compliance_documents. Add only absent logical entities (memberships/settings, file objects, sanitizer readings, version/events, import review and outbox).
4. Server-generated PDFs and Resend (existing provider); timezone-aware server cron; durable, leased, idempotent outbox; provider acceptance is distinct from inbox delivery.
5. PDF text extraction locally; optional server-side OCR adapter for images/scans. Preserve raw text and original file; review/confirm before ledger mutation. Sample amounts never used as extraction fallbacks.
6. Retain existing fonts/tokens/components. Role-relevant workspace navigation, explicit location/date selectors, accessible forms/tables and honest empty/error states.

## Implementation checklist

### Phase 1 — foundation (in progress)
- [ ] Additive SQL release, personal roles, location membership/settings and database authorization.
- [ ] Private file registry, append-only events, notifications/outbox.
- [ ] Location administration and scoped API/UX integration.
- [ ] Unauthorized cross-location/role/database tests.

### Phase 2 — operations & food safety
- [ ] Configurable templates preserving existing opening/closing/cleaning tasks.
- [ ] Attributed daily sheets with values/notes/evidence and immutable revisions.
- [ ] Configurable equipment × 11:00/16:00/20:00 Celsius records.
- [ ] Separate PPM sanitizer readings, missing entries, history and configurable limits.
- [ ] Operations/database tests.

### Phase 3 — inventory & financial automation
- [ ] Preserve item codes, unit/pack sizes, case/packet pricing/category/source.
- [ ] Reviewed master import; original Numbers verification pending reference file.
- [ ] Real PDF/OCR extraction + review + duplicate detection + atomic purchase confirmation.
- [ ] POS labels/figures + configurable selected sales basis + correction history.
- [ ] Location month snapshots, complete-period guard, transactional finalize/reopen/carry-forward.
- [ ] Financial reconciliation/duplicate/rollback tests.

### Phase 4 — designer & marketing
- [ ] Dedicated designer workspace using existing login.
- [ ] Location request form and configurable explicit-unit formats.
- [ ] Corporate approval/rejection, assignment and backend-enforced transitions.
- [ ] Private immutable design versions, feedback and completion.
- [ ] Calendar views/statuses linked to existing promotions/assets.
- [ ] Workflow A and rejection/permission tests.

### Phase 5 — email & compliance
- [ ] Combined daily PDF generated from persisted records, missing entries retained.
- [ ] Location timezone/business-date delivery + recipients + safe retry/resend/logging.
- [ ] Private compliance records, confirmed renewals/history, 60/30 reminders.
- [ ] In-app notifications independent of email.
- [ ] Workflow B/C scheduling/PDF/outbox tests; live email blocked on credentials/recipients.

### Phase 6 — corporate dashboard
- [ ] Location/date/status filters; operations, financial, marketing, compliance and email drill-downs.

### Phase 7 — release verification
- [ ] Unit/database/API/authorization tests.
- [ ] Browser acceptance and responsive review.
- [ ] ESLint, TypeScript, production build, diff validation.
- [ ] Update final evidence/status matrix and SQL Editor deployment instructions.

## Open client settings

Equipment count (three vs four/five ordinary coolers); approved Celsius/PPM limits; POS top Summary Total Net Sales selection; each site's IANA timezone, business-day cutoff and report time; real recipients; required certificate/licence types; print specs. Configurable implementation proceeds while these remain unconfirmed.

## Resume instructions

Read this file and `git status`; consult the new release SQL/runbook and evidence before further changes. Never rerun demo seeds or infer deployed schema from local SQL. Keep old `NEXT_SESSION.md` as historical evidence; this document supersedes its unverified migration status only where the read-only November 6 checks above provide evidence.
