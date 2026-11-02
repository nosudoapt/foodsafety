# BTB — next-session handoff

Updated: 2026-11-02 after the uploader integration and dashboard-release preparation. Local implementation, verification and the normal production build are complete. Continue with focused reads; completed features do not need rebuilding.

## Start here

- Repository: `/Users/nitpreetsingh/Documents/GitHub/FoodSafeHere/foodsafety` (the parent folder is not a Git repo).
- This release includes the accumulated application work and the localhost stale-cache fix. Check `git status` before further edits and preserve any user changes. Neither release SQL transaction has been confirmed live. The dedicated Supabase Auth/profile uploader has been provisioned and verified live.
- Git origin: `github.com/nosudoapt/foodsafety.git`, branch `main`. GitHub commit statuses confirm Vercel integrations for both `foodsafety` and `bitesbrew` under `nosudoapts-projects`. The user requested committing/pushing this release; verify the current commit's deployment status before checking the live app.
- Read `AGENTS.md`; before code changes, consult relevant local Next.js documentation under `node_modules/next/dist/docs/`.
- **No verification job is running.** The normal `.env.local` build has replaced the browser-fixture build.

## Remaining work, in order

1. Check the pushed `main` commit's Vercel deployments for **foodsafety** and **bitesbrew**, identify the production URL, and verify the variables in `deploy/BTB_DASHBOARD_SETUP.md`. GitHub CLI access works; the user uses Vercel dashboard and **Supabase SQL Editor**. Keep secrets in the dashboard or ignored `.env.local`.
2. Coordinate the application deployment with these SQL Editor files, in order: `supabase/schema-btb-team-operations.sql` → `supabase/schema-btb-uploads.sql` → `deploy/05-btb-release-check.sql`. Ask for the 39-row result grid or the exact transaction error. Verify live server APIs, uploader connection, uploads/downloads and both manuals applications.
3. Configure a Resend-verified sender, real manager/corporate recipients and the deployed scheduler. The user will supply recipient addresses later. Check provider delivery IDs and obtain actual inbox confirmation.

These require the user's dashboard configuration and results. Local integration, full verification, visual reviews and the final normal production build are finished.

### Completed follow-up

- Fixed stale localhost JavaScript served by the offline worker: localhost registration now clears old FoodSafe caches/workers; the updated worker bypasses local requests and unregisters locally. Homepage interactions and the fallback logo were checked with zero runtime errors. Targeted lint, TypeScript and a fresh normal production build passed.
- Implemented `/api/btb/documents`, `/api/btb/marketing` and `/api/btb/social-posts` with verified BTB sessions, role/page permissions, restaurant scope, file validation, complete pagination and authorized downloads/mutations. Document/marketing creation uses a genuine profile independently of simultaneous FoodSafe sessions.
- Provisioned and reread the marked Auth/profile identity `btb-uploader@foodsafe.invalid`: `BTB_UPLOADER_PROFILE_ID=67472997-c69a-460d-b171-2a527df8ff5c`. Its role is `staff`, restaurant is `Between the Buns`, and interactive login is disabled. The ID is saved in `.env.local`; the provisioning-script rerun successfully reused the same identity.
- Added `schema-btb-uploads.sql`: preserve profile foreign keys, add verified employee/shared-workspace attribution, revoke legacy anon access and retain FoodSafe authenticated access with a restrictive BTB boundary. Creation controls enable after connection verification; failures retain drafts and offer retry. New documents/artwork have a 3 MB limit; BTB campaigns are company-wide.
- Added five SQL uploader subtests and seven browser tests. Upload browser fixtures execute the real SQL foreign keys and RLS. Reviewed document/marketing desktop and 375px captures plus the mobile retained-draft dialog.
- Added dashboard instructions and a read-only release verifier. Its 39 checks pass locally with the existing training policies; missing release objects and six injected grant/function/policy/FK/uploader failure cases correctly fail. The shared test helper imports only training table declarations, so standalone catalog verification must include the existing `schema-training.sql` RLS/policies.
- Scoped the feedback-announcement assertion so refresh loading statuses cannot collide.
- Manuals now fetch published training through `/api/btb/training/print` and `/api/manuals/training`, with independent BTB/Supabase authentication. BTB verifies both page permissions and shared scope; FoodSafe verifies management roles, trial status and authorized home/member sites (all sites for group-wide roles).
- Ordered training sections are fully paginated; failed training or stored-PDF reads stop incomplete printing and show a retryable error. Browser training access remains revoked. Seven new browser tests cover authorization, simultaneous sessions, site scope, failures and more than 1,000 sections.
- Reviewed fresh loyalty employee/customer and employee-training desktop/375px captures plus the supervisor training dashboard. Updated `UI_HANDOFF.md` and the setup runbook.

## Last completed verification

| Check | Result |
| --- | --- |
| ESLint | Clean |
| Standalone TypeScript | Passed |
| Unit/database checks | **342/342**, including nine operations and five uploader SQL subtests |
| Full Chromium suite | **79/79**, including seven manuals and seven uploader tests |
| Actual-PDF checks | **3/3**: one Letter page, complete saved-only text, in-page coordinates |
| Five role dashboards | All passed after Saskatchewan-date corrections |
| Label contrast (previous measurements) | Loyalty **6.12:1**; training **7.55:1** |
| SQL release verifier | **39/39** locally; missing/partial release objects and injected drift correctly report FAIL |
| Live uploader identity | Auth/profile and disabled login verified; provisioning rerun reused the same UUID |
| Normal production build | Passed last with `.env.local`; no loopback fixture URL/keys in browser assets |
| Diff whitespace check | Passed |
| Earlier local app smoke check | Passed at `http://127.0.0.1:5001` |

Latest browser artifacts are in `test-results/` and the full report is in `playwright-report/`. The earlier local smoke check covered public landing/sign-in pages, form controls, 375px layout, signed-out manuals redirects and HTTP 401 from both print APIs. The latest authenticated uploader and other application flows were verified against the loopback browser fixtures; the live deployment requirements below still apply.

Run from the repository using Node 22 (already required by `package.json`):

```sh
npx --yes --package=node@22 -- npm run lint
npx --yes --package=node@22 -- npx tsc --noEmit
npx --yes --package=node@22 -- npm test
npx --yes --package=node@22 -- npm run test:e2e
npx --yes --package=node@22 -- npm run build
git diff --check
```

Use targeted checks while fixing issues; run the final suite once, repeating only for subsequent changes or failures.

## Implemented features and invariants

- **Individual employee accounts:** name/phone/email management, password changes, verified identities and session invalidation. BTB authentication is independent of FoodSafe/Supabase Auth; shared role workspaces remain supported. Salted scrypt passwords, 10–128 characters, signed 12-hour cookies and credential versions.
- **Permissions:** supervisors manage staff, schedules and orders; managers manage staff/supervisor/manager accounts. Training approval is manager-only, never self-approval; module revisions require renewed review. Users cannot deactivate themselves or change their own role. Administrator access is limited to access management.
- **Operations:** named opening/closing schedules visible to management; verified employee attribution on checks; explicit labels such as `Manager (shared workspace)` for shared management saves; independent device drafts and Saskatchewan dates via `btbToday()`.
- **Persistence:** confirm saves before success, retain failed drafts, handle stale versions; site-scoped server-only tables and transactional RPCs. Preserve legacy source rows, old orders, previous-order quantities, saved snapshots and revisions.
- **Printing:** `OnePagePrint` fits both dimensions and reflows dense content. Each daily opening + closing checklist, weekly schedule and saved order prints completely on one page, independently of filters/unsaved drafts. Dense tests cover full handovers, 20 employees/140 shifts, and 254 catalog-plus-archived order lines.
- **Training:** publishing, section progress, submissions, manager feedback/review history, authenticated video uploads, and manager/supervisor/corporate dashboard progress.
- **Uploads:** profile-owned document/promotion/social rows with separate `btb_created_by` employee FK and durable `btb_created_by_name`; server-owned restaurant and actor attribution. Existing FoodSafe identity is never reused for BTB. New attachments are limited to 3 MB and file payloads load only on download.
- **Other delivered work:** staff certificates; Branding Requests renamed “Uniform” to **“T-shirt”**, sizes S–XXXL; existing corporate-only card renamed **Franchise Opening Checklist**, retaining `/between-the-buns/new-restaurant` and all 16 supplied sections/every task.
- **Design:** preserve porcelain-and-plum styling, self-hosted DM Sans/DM Serif Display, shared controls, accessible dialogs and responsive layouts.

### Loyalty requirements already implemented

One **Loyalty Rewards** card contains employee/customer guides for staff, supervisors and managers. Retain:

- **ASK → SCAN → VIEW OFFERS → ENTER ORDER → PAY LAST**; scan before entering the order.
- Welcome: free appetizer, completed profile, activation within 24 hours, valid seven days. Birthday: free appetizer, profile completed at least one day before redemption, valid seven days.
- Burger punch: buy five eligible burgers, get one free; burger only, expires after 20 days. Cheese, toppings and upgrades cost extra.
- Only visible, valid, eligible offers under their item/date/expiry rules; never create or override missing, expired or ineligible rewards.
- Eligible: dine-in, walk-in takeout, phone orders scanned at pickup before payment, signed-in MYR pickup/delivery. Exclude SkipTheDishes, Uber Eats and DoorDash.
- Reward: scan → review pop-up → confirm choice → eligible item → apply reward → remaining balance. Points: scan → order → “Pay with Loyalty” → available points → balance.
- Approved workaround for any visible, valid promotional reward blocked only by a purchase requirement: **“Various Item” $0.05 → apply reward → complete $0.05 payment**.
- Paid signed-in MYR orders post points/rewards automatically; troubleshoot profile completion, 24-hour wait and reward visibility. Staff escalation: **Kamal, 306-314-9468**. Customer guide includes activation, barcode-first redemption, personalized offers and “Questions? Ask a team member.”

## Live deployment blockers

- Both `supabase/schema-btb-team-operations.sql` and `supabase/schema-btb-uploads.sql` are **not applied live**. The user will use SQL Editor, so the historical **28P01** database-password failure is not a blocker for this chosen workflow.
- Missing local configuration: `BTB_PASSWORD`, `BTB_SESSION_TOKEN`, `RESEND_API_KEY`, `BTB_EMAIL_FROM`, `CRON_SECRET`. Production setup, real manager/corporate recipients and deployed scheduling remain outstanding.
- GitHub links this repository to Vercel projects `foodsafety` and `bitesbrew`. Production configuration and the new revision's live deployment require verification through its GitHub deployment records/Vercel dashboard.
- Reminder settings default to disabled with empty recipients. Reminders use `[30, 7, 1, 0]` days, five-minute leases, frozen retry content/provider keys, **three total delivery attempts**, and stop uncertain retries after 23 hours. Manual dispatch: 30 claims/45 seconds; cron: 300/270 seconds with a 300-second route maximum. Daily schedule: **15:00 UTC / 09:00 America/Regina** (`vercel.json`). Browser simulation is not proof of real inbox delivery.
- The real uploader is ready. Copy its UUID to Vercel, then confirm live document/marketing responses include `uploader.connected: true` after deployment. Auth `listUsers` previously returned HTTP 500 and a later profile reread hit transient HTTP 522; the script now uses targeted lookups, and the final live verification/rerun succeeded.
- Dashboard runbook: `deploy/BTB_DASHBOARD_SETUP.md`. Detailed runbook: `deploy/BTB_TEAM_SETUP.md` (14 new tables/nine functions, training/upload permissions, bootstrap and reminders). Read-only verifier: `deploy/05-btb-release-check.sql`.

## Useful locations and test context

- `UI_HANDOFF.md`: implementation/interaction documentation and current verification results.
- `src/app/between-the-buns/`, `src/components/btb/`, `src/lib/`, `src/app/btb-operations.css`: operations, print fitting, auth/permissions/reminders/guides and visual fixes.
- `e2e/btb-postgrest.mjs`: SQL fixture replacement now removes omitted rows before inserting, preventing collisions.
- `e2e/mock-supabase.mjs`: Saskatchewan-dated fixtures and HTTP error responses instead of server termination.
- `e2e/manuals.spec.ts`: independent manuals sessions, role/site restrictions, read-failure recovery and complete section pagination. `src/lib/training-manuals.ts` is the shared server-only reader.
- `e2e/btb-uploads.spec.ts`, `tests/btb-uploads-database.test.mjs`: real profile FKs, role/session isolation, retained drafts, connection recovery, validation, scope and pagination. `src/lib/btb-uploader.ts` and `scripts/provision-btb-uploader.mjs` implement profile resolution/provisioning.
- Browser fixtures: PGlite-backed SQL, `127.0.0.1:5101` / `5102`; FoodSafe `${role}@workspace.test`, BTB `${role}@foodsafe.demo`, password `BrowserTest!234`; fake service key `browser-test-service-key`.
- Email simulation is loopback-only via `/__test/send-email`; includes rejection and accepted-then-500 cases. Browser-origin checks compare against the incoming Host header.
- PDF raster reviews: `/private/var/folders/ls/qsfwpxnx2rx4ln2q5kf7qglr0000gn/T/opencode/btb-final-print-review/` (created using `pdfjs-dist/legacy/build/pdf.mjs` and `@napi-rs/canvas`).
- The development app's usual local address is **http://127.0.0.1:5001**. The final production build and browser-fixture checks above are complete.
