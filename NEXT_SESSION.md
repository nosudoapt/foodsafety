# BTB — next-session handoff

Updated: 2026-11-04 after publishing and verifying temperature/prep-history restoration. Continue with focused reads; completed features do not need rebuilding. The November 2 verification is retained separately from the latest work.

## November 4 temperature and saved-sheet restoration

- Client request: **“and what about the temp cheet and cleaning logs ? are they coming like before?”** Temperature Log and Daily Prep Sheet are separate workflows. The missing temperature link was removed in `6fc3318` when BTB authentication was separated; the old `/temperatures` FoodSafe page still exists.
- **Published `1ec8471` — `Restore BTB temperature log and saved prep history`** to `origin/main`, following the user's explicit “Publish fixes (Recommended)” approval. Both Vercel projects succeeded: **foodsafety** deployment `7547622147`, **bitesbrew** deployment `7547638619`.
- Added `/between-the-buns/temperatures`, its hub/navigation card and `/api/btb/temperatures`. Operational roles record Celsius readings with an explicit kitchen target range; corporate reviews read-only. The server supplies the actor/time and calculates “Within target” / “Outside target”. UUID retries are append-once and cannot overwrite a reading. History reads every database page within 90 days.
- Temperature storage resolves `btb-uploader@btb.invalid` directly from `profiles`, then checks its Auth ID, marker and active login ban. Its genuine UUID owns `temperature_records`; scope is `Between the Buns` + that owner + `location_id IS NULL`. This uses the existing backend configuration and schema. Earlier FoodSafe readings retain their original owners and remain reachable through a clearly labelled legacy-history link.
- Fixed Daily Prep History, which previously held only this browser visit's saves. It now reloads the latest seven **saved dates**, finishes whole dates across database pages and includes archived catalog items/zero quantities. Opening a sheet uses the same complete reader; same-date Load works. Reads, deletes and offline replay agree on restaurant/location scope. Failed reads offer retry and disable saving an incomplete sheet. The misleading in-memory-only Delete control is removed.
- Read-only **public Chromium verification passed at https://foodsafety-sigma.vercel.app**: manager login and hub links work; Prep History shows **October 21 and October 15, six saved rows each**, and both saved sheets open. Temperature Log, date-filtered history and the entry dialog load; `/api/btb/temperatures` returns **200** with **0 BTB readings**, and **401** when signed out. Its legacy link reaches the separate original FoodSafe sign-in.
- Public Cleaning Schedule shows all **11 tasks** and **0 saved weeks**. All three workflows fit 375px, with **zero browser runtime errors and zero attempted production data writes**. Both connected cleaning tables are empty; recovering earlier cleaning entries requires the client's original account/data source or backup. Save/reload and cleaning-photo persistence passed in the isolated browser tests.
- Final checks: ESLint, standalone TypeScript, **347/347** unit/database checks and **91/91** full Chromium tests pass, including six temperature tests, five prep/cleaning tests and all three complete one-page PDF checks. The final browser run includes the corrected legacy FoodSafe fixtures and waits for a saved legacy reading after following its link.
- Desktop/375px temperature, prep and cleaning captures and the retained temperature-save dialog have been reviewed. The normal production build passed last with `.env.local`; all **94** browser assets checked are free of loopback fixture configuration and the service-role credential. `git diff --check` passes.

## November 4 login correction

- The user reported **“BTB login is not configured”** and requested keeping login details in the backend instead of environment variables.
- `src/lib/btb-auth.ts` now owns the familiar shared workspace credentials (`* / `admin1234`, and the other existing role accounts). Personal employee credentials remain hashed in the database.
- `BTB_PASSWORD` and `BTB_SESSION_TOKEN` are no longer read or required. Signed shared/personal sessions derive a private key automatically from the existing `SUPABASE_SERVICE_ROLE_KEY`; role binding, employee expiry and credential-version verification remain in place.
- Published as **`8e1d98b` — `Restore backend-owned BTB workspace login`**. GitHub reports successful deployments for both **foodsafety** and **bitesbrew**. This login correction needs no SQL installation; old sessions may need a fresh sign-in.
- Verified the public manager sign-in through HTTP and Chromium at **https://foodsafety-sigma.vercel.app/between-the-buns/login**, using **`* / `admin1234`**. The dashboard, Cleaning Schedule and Daily Prep Sheet load without runtime errors. The form button is **“Open my workspace”**.
- November 4 read-only checks: `prep_counts` has **12** rows; `cleaning_logs` and FoodSafe `cleaning_records` each have **0** rows; `temperature_records` has **4** rows (one `My Restaurant`, three `The Grill House`). Browser requests confirmed the public site uses the **same Supabase project**. The published pre-fix Prep History incorrectly showed `0/7` despite those saved rows.
- Login regression checks: lint and TypeScript pass; **343/343** unit/database checks pass; **22/22** targeted Chromium tests pass (`auth.spec.ts`, `btb.spec.ts`, `btb-team.spec.ts`). These cover production login without BTB env settings, old-cookie recovery, all five shared roles, employee credentials/session invalidation and operational permissions. The manager cleaning link is visible in the browser test.
- The login release's normal `.env.local` production build passed after browser testing. Browser assets contained neither the signing implementation nor the loopback fixture URL/keys. The user explicitly approved committing/pushing that fix on November 4; its deployment and public login are verified.
- Restarted the old local dev server after it retained a stale proxy/login check. Fresh manager login, `/api/btb/me`, the BTB hub and `/between-the-buns/cleaning-schedule` now return **HTTP 200** at `http://127.0.0.1:5001`. The connected database's saved page settings enable Cleaning Schedule for the manager. The replacement dev server remains running.
- Earlier accumulated application work is `48a83e6`. Shared manager sign-in requires no SQL; new individual-account/operations features still need their separate existing release migrations. The public `/api/btb/documents` currently returns **503**, “The document register couldn’t be loaded. Please try again.”

## Start here

- Repository: `/Users/nitpreetsingh/Documents/GitHub/FoodSafeHere/foodsafety` (the parent folder is not a Git repo).
- This release includes the accumulated application work and the localhost stale-cache fix. Check `git status` before further edits and preserve any user changes. Neither release SQL transaction has been confirmed live. The dedicated Supabase Auth/profile uploader has been provisioned and verified live.
- Git origin: `github.com/nosudoapt/foodsafety.git`, branch `main`. GitHub commit statuses confirm Vercel integrations for both `foodsafety` and `bitesbrew` under `nosudoapts-projects`. The user requested committing/pushing this release; verify the current commit's deployment status before checking the live app.
- Read `AGENTS.md`; before code changes, consult relevant local Next.js documentation under `node_modules/next/dist/docs/`.
- **No verification job is running.** The normal `.env.local` production build has replaced the browser-fixture build.

## Remaining work, in order

1. Obtain the client's original account/data source or backup if earlier cleaning entries must be recovered. The published temperature/prep fixes and live workflows are verified; the connected database contains no historical cleaning rows. GitHub CLI access works; the user uses Vercel dashboard and **Supabase SQL Editor**.
2. Coordinate the application deployment with these SQL Editor files, in order: `supabase/schema-btb-team-operations.sql` → `supabase/schema-btb-uploads.sql` → `deploy/05-btb-release-check.sql`. Ask for the 39-row result grid or the exact transaction error. Verify live server APIs, uploader connection, uploads/downloads and both manuals applications.
3. Configure a Resend-verified sender, real manager/corporate recipients and the deployed scheduler. The user will supply recipient addresses later. Check provider delivery IDs and obtain actual inbox confirmation.

The release SQL/email follow-ups require the user's dashboard configuration and results. Earlier operations/uploads verification is finished; the latest temperature/prep status is recorded at the top.

### Completed follow-up

- Fixed stale localhost JavaScript served by the offline worker: localhost registration now clears old FoodSafe caches/workers; the updated worker bypasses local requests and unregisters locally. Homepage interactions and the fallback logo were checked with zero runtime errors. Targeted lint, TypeScript and a fresh normal production build passed.
- Implemented `/api/btb/documents`, `/api/btb/marketing` and `/api/btb/social-posts` with verified BTB sessions, role/page permissions, restaurant scope, file validation, complete pagination and authorized downloads/mutations. Document/marketing creation uses a genuine profile independently of simultaneous FoodSafe sessions.
- Provisioned and reread the marked Auth/profile identity `btb-uploader@btb.invalid`: `BTB_UPLOADER_PROFILE_ID=67472997-c69a-460d-b171-2a527df8ff5c`. Its role is `staff`, restaurant is `Between the Buns`, and interactive login is disabled. The ID is saved in `.env.local`; the provisioning-script rerun successfully reused the same identity.
- Added `schema-btb-uploads.sql`: preserve profile foreign keys, add verified employee/shared-workspace attribution, revoke legacy anon access and retain FoodSafe authenticated access with a restrictive BTB boundary. Creation controls enable after connection verification; failures retain drafts and offer retry. New documents/artwork have a 3 MB limit; BTB campaigns are company-wide.
- Added five SQL uploader subtests and seven browser tests. Upload browser fixtures execute the real SQL foreign keys and RLS. Reviewed document/marketing desktop and 375px captures plus the mobile retained-draft dialog.
- Added dashboard instructions and a read-only release verifier. Its 39 checks pass locally with the existing training policies; missing release objects and six injected grant/function/policy/FK/uploader failure cases correctly fail. The shared test helper imports only training table declarations, so standalone catalog verification must include the existing `schema-training.sql` RLS/policies.
- Scoped the feedback-announcement assertion so refresh loading statuses cannot collide.
- Manuals now fetch published training through `/api/btb/training/print` and `/api/manuals/training`, with independent BTB/Supabase authentication. BTB verifies both page permissions and shared scope; FoodSafe verifies management roles, trial status and authorized home/member sites (all sites for group-wide roles).
- Ordered training sections are fully paginated; failed training or stored-PDF reads stop incomplete printing and show a retryable error. Browser training access remains revoked. Seven new browser tests cover authorization, simultaneous sessions, site scope, failures and more than 1,000 sections.
- Reviewed fresh loyalty employee/customer and employee-training desktop/375px captures plus the supervisor training dashboard. Updated `UI_HANDOFF.md` and the setup runbook.

## Earlier full verification — November 2

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

- Neither `supabase/schema-btb-team-operations.sql` nor `supabase/schema-btb-uploads.sql` has been **confirmed applied live**; the public documents API still returns 503. The user will use SQL Editor, so the historical **28P01** database-password failure is not a blocker for this chosen workflow.
- Missing local email configuration: `RESEND_API_KEY`, `BTB_EMAIL_FROM`, `CRON_SECRET`. Production setup, real manager/corporate recipients and deployed scheduling remain outstanding. Separate BTB login environment variables are no longer needed.
- Both Vercel projects successfully deployed temperature/prep application commit `1ec8471` after login commit `8e1d98b`; public FoodSafety login and all three restored/reviewed workflows are verified. Generated deployment URLs require Vercel authentication.
- Reminder settings default to disabled with empty recipients. Reminders use `[30, 7, 1, 0]` days, five-minute leases, frozen retry content/provider keys, **three total delivery attempts**, and stop uncertain retries after 23 hours. Manual dispatch: 30 claims/45 seconds; cron: 300/270 seconds with a 300-second route maximum. Daily schedule: **15:00 UTC / 09:00 America/Regina** (`vercel.json`). Browser simulation is not proof of real inbox delivery.
- The real uploader is ready. Copy its UUID to Vercel, then confirm live document/marketing responses include `uploader.connected: true` after deployment. Auth `listUsers` previously returned HTTP 500 and a later profile reread hit transient HTTP 522; the script now uses targeted lookups, and the final live verification/rerun succeeded.
- Dashboard runbook: `deploy/BTB_DASHBOARD_SETUP.md`. Detailed runbook: `deploy/BTB_TEAM_SETUP.md` (14 new tables/nine functions, training/upload permissions, bootstrap and reminders). Read-only verifier: `deploy/05-btb-release-check.sql`.

## Useful locations and test context

- `UI_HANDOFF.md`: implementation/interaction documentation and current verification results.
- `src/app/between-the-buns/`, `src/components/btb/`, `src/lib/`, `src/app/btb-operations.css`: operations, print fitting, auth/permissions/reminders/guides and visual fixes.
- `e2e/btb-postgrest.mjs`: SQL fixture replacement now removes omitted rows before inserting, preventing collisions.
- Temperature: `src/lib/btb-temperature-store.ts`, `src/lib/btb-temperatures.ts`, `e2e/btb-temperatures.spec.ts`, `tests/btb-temperature-database.test.mjs`. Saved sheets: `e2e/btb-saved-sheets.spec.ts`.
- `e2e/mock-supabase.mjs`: Saskatchewan-dated fixtures and HTTP error responses instead of server termination.
- `e2e/manuals.spec.ts`: independent manuals sessions, role/site restrictions, read-failure recovery and complete section pagination. `src/lib/training-manuals.ts` is the shared server-only reader.
- `e2e/btb-uploads.spec.ts`, `tests/btb-uploads-database.test.mjs`: real profile FKs, role/session isolation, retained drafts, connection recovery, validation, scope and pagination. `src/lib/btb-uploader.ts` and `scripts/provision-btb-uploader.mjs` implement profile resolution/provisioning.
- Browser fixtures: PGlite-backed SQL, `127.0.0.1:5101` / `5102`; FoodSafe `${role}@workspace.test` and individual employees use `BrowserTest!234`; shared BTB `${role}@btb.demo` accounts use `admin1234`. Fake service key: `browser-test-service-key`.
- Email simulation is loopback-only via `/__test/send-email`; includes rejection and accepted-then-500 cases. Browser-origin checks compare against the incoming Host header.
- PDF raster reviews: `/private/var/folders/ls/qsfwpxnx2rx4ln2q5kf7qglr0000gn/T/opencode/btb-final-print-review/` (created using `pdfjs-dist/legacy/build/pdf.mjs` and `@napi-rs/canvas`).
- The development app remains at **http://127.0.0.1:5001**. Read-only local real-data screenshots use `btb-restored-live-*.png`; published-site captures use `btb-published-*.png`, under `/private/var/folders/ls/qsfwpxnx2rx4ln2q5kf7qglr0000gn/T/opencode/`. The read-only public verification script is `btb-release-smoke.cjs` in that same temporary directory.
