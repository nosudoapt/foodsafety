# UI / UX handoff

## Visual foundation

Warm porcelain surfaces, plum primary actions, self-hosted DM Sans and DM Serif Display are shared across the landing page, authentication, FoodSafe and BTB. The detailed style reference is `DESIGN.md`.

| Area | Main files |
| --- | --- |
| Design tokens and working-screen styles | `src/app/tokens.css`, `src/app/workspace.css`, `src/app/btb-operations.css` |
| Shared controls, accessible tabs and dialogs | `src/components/ui.tsx`, `src/components/Modal.tsx` |
| FoodSafe shell and navigation | `src/components/AppShell.tsx`, `src/lib/workspace-nav.ts`, `src/lib/admin-nav.ts` |
| FoodSafe role dashboards | `src/components/dashboard/`, `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts` |
| BTB shell, role overview and permissions | `src/app/between-the-buns/`, `src/contexts/BtbWorkspaceContext.tsx`, `src/lib/btb-page-access.ts` |
| Documents and campaign planning | `src/components/DocumentVault.tsx`, `src/components/MarketingBoard.tsx` |
| BTB upload authorization and profile connection | `src/app/api/btb/{documents,marketing,social-posts}/`, `src/lib/btb-uploader.ts`, `scripts/provision-btb-uploader.mjs` |
| Renewals and filing dates | `src/components/ComplianceRegister.tsx`, `src/components/TaxDatesPanel.tsx` |
| Shift checks and inventory | `src/app/checks/page.tsx`, `src/app/between-the-buns/month-end-inventory/page.tsx` |
| Authentication | `src/app/auth/`, `src/components/auth/`, `src/contexts/AuthContext.tsx` |
| BTB employee accounts and verified API access | `src/app/between-the-buns/employees/`, `src/app/between-the-buns/account/`, `src/lib/btb-auth.ts`, `src/lib/btb-api.ts`, `src/lib/btb-passwords.ts` |
| BTB checks, schedules, orders and printing | `src/app/between-the-buns/checklists/`, `src/app/between-the-buns/staff-schedule/`, `src/app/between-the-buns/order-sheet/`, `src/components/btb/OnePagePrint.tsx` |
| Training progress and manager review | `src/app/between-the-buns/training-guide/`, `src/components/btb/TrainingProgress.tsx`, `src/app/api/btb/training/` |
| Published training in manuals | `src/components/PrintManuals.tsx`, `src/lib/training-manuals.ts`, `src/app/api/btb/training/print/`, `src/app/api/manuals/training/` |
| Certificates and licence emails | `src/app/between-the-buns/staff-licenses/`, `src/app/between-the-buns/licence-reminders/`, `src/lib/btb-reminder-service.ts`, `src/app/api/cron/btb-licence-reminders/` |
| Franchise and loyalty guides | `src/lib/btb-franchise.ts`, `src/lib/btb-loyalty.ts`, `src/app/between-the-buns/new-restaurant/`, `src/app/between-the-buns/loyalty-rewards/` |
| BTB persistence and release setup | `supabase/schema-btb-team-operations.sql`, `supabase/schema-btb-uploads.sql`, `deploy/BTB_DASHBOARD_SETUP.md`, `deploy/05-btb-release-check.sql`, `.env.example`, `vercel.json` |

## Interaction contracts

- FoodSafe has six tailored role dashboards. BTB has five, including a permissions-focused administrator workspace.
- Managers manage staff, supervisor and manager employee records; supervisors manage staff accounts and edit weekly schedules and order sheets. Names, phone numbers and individual email logins are required. Personal BTB passwords and signed 12-hour sessions are independent of FoodSafe/Supabase Auth.
- Failed reads show an unavailable state and a retry. Success messages follow confirmed persistence; rejected saves retain the current form values.
- BTB opening/closing checks attribute each changed duty from the verified employee session. Opening and closing device drafts are isolated by employee and date, survive reloads, and remain available after failed or stale saves. Shared role workspaces have explicit management attribution and require an individual login for duty completion or personal training.
- Weekly opening/closing coverage always includes the whole team, including when an employee filter is applied. Overnight shifts carry an explicit next-day indicator and overlapping shifts are rejected.
- Order history retains dated snapshots, previous quantities, archived items and every saved revision. Screen filters and unsaved edits do not alter the saved printout.
- Training completion counts only current published modules approved by a manager. Supervisors and corporate can monitor team progress; manager review, feedback, self-approval prevention and renewed review after module edits are enforced by the server.
- BTB dashboard dates and operational defaults use the Saskatchewan workday through `btbToday()`.
- The campaign board has real month filters. Undated social ideas remain in the weekly plan; dated posts contribute to the dashboard’s upcoming-post count.
- BTB document/marketing reads, downloads and mutations use authenticated server endpoints. Creation enables after a real uploader-profile connection check, with connection retry and retained failed drafts. Records show the verified employee/shared-workspace creator. The dedicated profile owns the legacy foreign keys independently of simultaneous FoodSafe sessions; new attachments have a 3 MB limit and BTB campaigns are company-wide.
- Inventory follows count → reconcile → close, with explicit saving, retained drafts, audit feedback and reopening.
- BTB compliance tabs respect the same role and saved page restrictions as their standalone pages. Renewal and document queries use `BTB_RESTAURANT`; filing dates use the company-wide `NULL` location.
- Filing templates fill a draft and require review of the due date before saving.
- Dialogs focus the intended field on opening, contain keyboard focus and restore the opening control. Tabs support arrow, Home and End keys. Narrow layouts wrap controls and contain wide tables; working-screen buttons share the 44px minimum control height.

## Content and print delivery

- **Branding Requests:** “T-shirt” replaces the Uniform label, with S, M, L, XL, XXL and XXXL. Existing stored `uniform` values remain compatible.
- **Franchise Opening Checklist:** the existing corporate-only card and `/between-the-buns/new-restaurant` route contain all 16 supplied sections and every task. Additional/imported tasks and their progress are retained; failed updates can be retried.
- **Loyalty Rewards:** one card exposes employee and customer guides to staff, supervisors and managers. The employee sequence is **ASK → SCAN → VIEW OFFERS → ENTER ORDER → PAY LAST**. Both guides include the approved reward, channel and expiry rules. Staff also have reward/points redemption flows, the approved $0.05 purchase-requirement workaround and Kamal’s escalation number.
- **Staff certificates:** optional employee linking or manual names, certificate dates and notes, PDF/image attachments, saved downloads and versioned editing.
- **Licence emails:** manager and corporate recipient groups, editable reminder windows, delivery history, manual sending and the authenticated daily cron. Default windows are 30, 7, 1 and 0 days; each job permits three total claims with five-minute leases and frozen retry content/provider keys. Uncertain delivery retries stop after 23 hours.
- **One-page printouts:** opening + closing checks share one portrait Letter sheet; weekly schedules use one landscape Letter sheet; saved orders use one portrait Letter sheet. Both dimensions are fitted, with dense content reflowing across the printable width. Complete saved content is preserved.
- **Manuals:** published training loads through separate BTB-cookie and FoodSafe/Supabase-authenticated endpoints. BTB enforces both manuals and training page access and includes shared topics; FoodSafe verifies management access and includes shared topics plus authorized home/member sites (all sites for group-wide roles). Ordered sections are fully paginated. Failed training or stored-PDF reads show an error and stop incomplete printing; retry clears stale print content. Browser training grants remain revoked.

## Deployment follow-up

The [dashboard setup guide](deploy/BTB_DASHBOARD_SETUP.md) matches the user's Vercel + Supabase SQL Editor workflow. The [BTB team setup runbook](deploy/BTB_TEAM_SETUP.md) documents schema prerequisites, account bootstrap, email configuration, scheduling and retry behaviour.

Neither release SQL transaction has been applied to the connected Supabase project. Coordinate the application deployment with `supabase/schema-btb-team-operations.sql`, then `supabase/schema-btb-uploads.sql`, using the complete files in SQL Editor. Run `deploy/05-btb-release-check.sql` and return its 39-row result grid, then verify the documented APIs and live grants. SQL Editor uses the dashboard login, so the historical database-password failure does not block this workflow. The project uses direct releases without a migration ledger.

Production requires `BTB_PASSWORD` and `BTB_SESSION_TOKEN`, which are absent from the local environment. Real reminder delivery additionally needs `RESEND_API_KEY`, `BTB_EMAIL_FROM`, `CRON_SECRET`, actual manager/corporate recipient addresses and a deployed scheduler. The included Vercel cron is **15:00 UTC / 09:00 America/Regina**. Local provider-fixture results establish dispatch behaviour; real inbox delivery still needs verification.

The uploader integration is complete. The real Auth/profile identity `btb-uploader@foodsafe.invalid` was provisioned and reread successfully, with BTB staff scope and interactive login disabled. `BTB_UPLOADER_PROFILE_ID=67472997-c69a-460d-b171-2a527df8ff5c` is saved in `.env.local`; copy it to Vercel. The provisioning-script rerun reused this same marked identity. Foreign keys remain genuine Supabase profile IDs, with employee attribution stored separately.

GitHub confirms Vercel integrations for `foodsafety` and `bitesbrew` under `nosudoapts-projects`. The user requested pushing this release to `nosudoapt/foodsafety` on `main`; check the new revision's deployment records for its live URLs/status. Release SQL and real inbox delivery still need the dashboard steps.

## Verification

### Local results — 2026-11-02

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript | Passed |
| Unit/database suite | 342 / 342 passed, including nine operations and five uploader SQL subtests |
| Full Chromium browser suite | 79 / 79 passed |
| Manuals access and print recovery | 7 / 7 passed within the browser suite |
| BTB uploader workflows and authorization | 7 / 7 passed within the browser suite |
| Actual-PDF checks | 3 / 3 passed: one Letter page, complete saved text and in-page coordinates |
| SQL release verifier | 39 / 39 pass locally; missing objects and injected drift correctly fail |
| Live uploader provisioning | Auth/profile and disabled login verified; rerun reused the same UUID |
| Normal production build | Passed last using `.env.local`; browser assets contain no loopback fixture URL/keys |
| Diff whitespace check | Passed |
| Earlier local app smoke check | Passed at `http://127.0.0.1:5001`: landing/sign-in pages, form controls, 375px layout, signed-out redirects and API authorization |

Earlier desktop/mobile reviews covered the landing page, authentication, role dashboards, documents, checklists, campaigns, inventory, BTB compliance, filing dates and the access editor; dense operational PDFs were also reviewed. Employee/customer loyalty and employee-training captures were reviewed at desktop and 375px widths, along with the supervisor training dashboard. The latest review covers BTB document and marketing uploader desktop/375px captures, creator labels, the social planner and the mobile retained-draft upload dialog. The feedback-announcement assertion targets its intended status message during refresh.

The localhost stale-module/provider errors were traced to cached development scripts. The service worker now bypasses localhost, with cleanup of old FoodSafe caches/registrations. Homepage interactions and the fallback logo were checked with zero runtime errors; targeted lint, TypeScript and the final normal production build passed after this fix.

The full browser report is in `playwright-report/`; current screenshots and PDFs are under `test-results/`, including `btb-{document,marketing}-uploader-{desktop,mobile}.png`, `btb-uploader-retained-draft-mobile.png`, `loyalty-{employee,customer}-{desktop,mobile}.png` and `employee-training-{desktop,mobile}.png`. Full-page captures start at the top, and open dialogs use viewport captures so fixed headers and backdrops are represented correctly.

### Repeat the checks

Use Node 22 or later:

```sh
npm run lint
npx tsc --noEmit
npm test
npm run test:e2e
npm run build
git diff --check
```

The browser suite starts a production-mode app on `127.0.0.1:5101` and a loopback Auth/PostgREST fixture on `127.0.0.1:5102`, with BTB operations and uploads backed by the actual SQL in PGlite. It exercises role-specific routes, failure recovery, saves, authentication callbacks, independent manuals/uploader sessions, location scope, complete printing and responsive layouts. Upload-table requests execute real foreign keys and database roles/RLS; their browser-access boundary is also covered by SQL tests. Screenshots and traces are attached to the Playwright report.

Browser-test builds embed loopback configuration. Run the normal `npm run build` last to restore the regular build configuration. Live email delivery, hosting secrets and production database policy verification follow `deploy/README.md`.
