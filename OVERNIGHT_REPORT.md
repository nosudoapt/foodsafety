# Overnight Report — 6 new BTB features + storage buckets, print & offline sync

Built autonomously overnight on `main`, one feature at a time. Every feature was
merged only after all four gates were green: `npm run build`, `npx tsc --noEmit`,
`npm run lint`, `npm test`.

## Final gate status

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` (node:test) | **168 / 168 passing** (was ~107 before tonight) |
| `npm run build` | 0 errors, all new routes prerendered |

Working tree clean. Commits tonight: six `feat:` (one per BTB feature), one
docs commit (this report), and three from the second agent session (storage
buckets `427cb80`, Training Guide print `a6f7176`, offline sync `3c4ea31`).

## What shipped

| # | Feature | SQL (step) | Pure logic | Tests | Route | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cash Out | `schema-cash-out.sql` (16) | `src/lib/cash-out.ts` | `tests/cash-out.test.ts` (6) | `/between-the-buns/cash-out` | `79c6ca1` |
| 2 | Staff Schedule | `schema-staff-schedule.sql` (17) | `src/lib/staff-schedule.ts` | `tests/staff-schedule.test.ts` (7) | `/between-the-buns/staff-schedule` | `180240c` |
| 3 | Corporate / Tax Dates | `schema-tax-dates.sql` (18) | `src/lib/tax-dates.ts` | `tests/tax-dates.test.ts` (7) | `/between-the-buns/tax-dates` | `141a1d6` |
| 4 | Training Guide | `schema-training.sql` (19) | `src/lib/training.ts` | `tests/training.test.ts` (7) | `/between-the-buns/training-guide` | `3d209d1` |
| 5 | Month-End Inventory | `schema-month-end-inventory.sql` (20) | `src/lib/month-end-inventory.ts` | `tests/month-end-inventory.test.ts` (7) | `/between-the-buns/month-end-inventory` | `d91eb5d` |
| 6 | Branding Requests | `schema-branding-requests.sql` (21) | `src/lib/branding-requests.ts` | `tests/branding-requests.test.ts` (7) | `/between-the-buns/branding-requests` | `af3d74b` |
| 7 | Storage buckets + shared photo upload helpers | `schema-storage-buckets.sql` (22) | `src/lib/files.ts` (`compressImage`, `uploadToSupabase`) | `tests/storage-buckets.test.ts` (3) | — | `427cb80` |
| 8 | Training Guide print / PDF | — | — | `tests/training-print.test.ts` (4) | `/between-the-buns/training-guide` | `a6f7176` |
| 9 | Offline sync (PWA) | — | `src/lib/offline-queue.ts` | `tests/offline-sync.test.ts` (11) | prep sheet + temperatures | `3c4ea31` |

Each feature also registered itself in the four places a BTB feature must:

- `src/lib/btb-access.ts` — `BtbFeature` union + `BTB_MATRIX` row (all six: `view: ALL`, `edit: MGR_ONLY`)
- `src/lib/btb-hub.ts` — hub card (`iconKey` from the existing union, feature-tagged so visibility derives from `btbCanView`)
- `tests/btb-access.test.ts` — `ROUTE_FEATURE` entry (route-coverage test walks `src/app/between-the-buns/`)
- `src/app/admin/layout.tsx` — admin nav row (Cash Out 💵, Corporate Dates 🗓️, Training Guide 📘, Month-End Inventory 📦, Branding Requests 🎨)

## SQL to run (Supabase SQL Editor)

Run in order; each file is idempotent (safe to re-run). **Steps 16–22 are new
tonight** — until they're run each page still loads but every read/write shows an
error banner naming the file to run.

| Order | File | Why |
| --- | --- | --- |
| 11 | `supabase/schema-locations.sql` | **still pending from earlier** — `locations` is a dependency of 14, 17, 20, 21 |
| 13 | `supabase/schema-prep-sheet.sql` | **still pending** — `prep_counts.pull` (live DB errors `42703` on Save) |
| 16 | `supabase/schema-cash-out.sql` | `cash_outs` (30-day retention, `purge_cash_outs()`) |
| 17 | `supabase/schema-staff-schedule.sql` | `staff_members` + `staff_shifts` (90-day retention, `purge_staff_schedule()`) |
| 18 | `supabase/schema-tax-dates.sql` | `corporate_dates` (kept forever) |
| 19 | `supabase/schema-training.sql` | `training_topics` + `training_sections` (kept forever) |
| 20 | `supabase/schema-month-end-inventory.sql` | `inventory_items` + `inventory_counts` (24-month retention, `purge_inventory_counts()`) |
| 21 | `supabase/schema-branding-requests.sql` | `branding_requests` (finished >24 months purged, `purge_branding_requests()`) |
| 22 | `supabase/schema-storage-buckets.sql` | Storage buckets `cleaning-photos`, `inspection-photos`, `training-videos` + policies — targets for `uploadToSupabase()` |

The four `purge_*()` functions are plain SQL — schedule them (pg_cron) or run by
hand; nothing breaks if they're never called, old rows just accumulate.
Retention policy per feature is documented in `supabase/README.md` (rows 16–21).

## Feature notes

- **Cash Out** — Today form (date, till, cash sale, delivery fees, driver tips,
  cash out, safe) with live Cash-in / Dropped / Left-in-till tiles, plus a
  30-day history tab with totals. Save is delete-then-insert for that date.
- **Staff Schedule** — Monday-first weekly calendar with week arrows, roster tab
  (add/remove people), post-a-shift form. "Staff see their own schedule" is
  implemented as an **Everyone / name** filter, because the BTB cookie carries a
  role, not a person.
- **Corporate Dates** — status buckets (overdue / ≤7 days / ahead), category
  chips, monthly/quarterly/annual recurrence that rolls forward **from the
  original anchor day** (Jan 31 → Apr 30 → Jul 31 → Oct 31, not drifting to the
  30th). `location_id IS NULL` = company-wide.
- **Training Guide** — topic list grouped by category, search across title +
  category + every section body, sections are plain text (blank line = new
  paragraph, `- ` lines render as checklist items). `published` hides drafts from
  staff/corporate; managers draft → publish.
- **Month-End Inventory** — pick the closing month (`YYYY-MM`), count items,
  closing value + variance vs previous close per row and in the header tiles.
  Save replaces that month's counts (only non-zero rows stored).
- **Branding Requests** — 5-column status board (open → in review → in progress →
  done/declined), priority-due sorted cards. **Everyone may file a request** (the
  page inserts directly); the matrix `edit: MGR_ONLY` still keeps status changes
  and deletes to managers, and the page gates those controls on `readOnly`.
- **Storage buckets** (second session) — `compressImage` (≤1280px, JPEG 65,
  <150KB) and `uploadToSupabase` moved from `src/lib/photos.ts` into
  `src/lib/files.ts`; `photos.ts` re-exports them so existing callers don't
  change. Three new buckets (`cleaning-photos`, `inspection-photos`,
  `training-videos`) created by step 22; existing photo paths stay in
  `ops-photos` (step 9), which `uploadToSupabase` still defaults to.
- **Training Guide print** (second session) — `PrintButton` in the page header;
  the interactive UI (search, list, detail) is wrapped in `print:hidden` and a
  hidden `#print-section` renders every topic that matches the current search,
  grouped by category, with paragraphs and `☐` checklist lines. The flat section
  fetch that used to power search alone now also feeds the print sheet.
- **Offline sync** (second session) — `src/lib/offline-queue.ts`: an IndexedDB
  outbox (`foodsafe-offline` DB) with an injected store so every path runs under
  `node:test`. A failed prep save or temperature reading whose error isn't a
  schema error is parked (capped at 50 ops, 5 attempts each) and replayed
  oldest-first on the next page load and on the browser's `online` event; each
  page drains only its own `kind`. Temperature entries freeze `recorded_at` at
  entry time so an offline reading keeps its real moment. Both pages show a
  "stored on this device" banner while anything is pending. Schema errors still
  surface the usual "run schema-….sql" banner instead of queueing.

## How to verify by hand

1. Run the SQL files above (16–22, plus 11 and 13 if still pending).
2. Dev server: `http://localhost:5001` (already running).
3. BTB login: `POST /api/btb/login` with `manager@foodsafe.demo` / `admin1234`.
4. Open `/between-the-buns` — the five new admin-linked cards plus Staff Schedule
   and the hub tiles; confirm a `staff` role login only reads.

## Known issues / follow-ups

- **Live-DB smoke tests were not run for tonight's nine changes** (no
  psql/supabase CLI locally; SQL is hand-run). Only the pre-existing
  `prep_counts` was verified against the live anon REST endpoint earlier. Expect
  the first page load of each new feature to show its "run schema-….sql" banner
  until steps 16–22 are run.
- A **second agent session worked the same tree** tonight (prep-sheet urgent
  flag, marketing fields, vault categories — `4197006`, `e96b87f`; then storage
  buckets `427cb80`, Training Guide print `a6f7176`, offline sync `3c4ea31`).
  Staging was kept to each session's files only; no known cross-contamination.
- **Offline sync covers two pages only** (prep sheet + temperatures). The queue
  in `src/lib/offline-queue.ts` is generic — extending it to cash-out, cleaning
  checks, inspections etc. is a matter of calling `enqueue`/`drain` with that
  page's `kind`.
- The offline banner only appears **after a failed save**; there's no global
  "you're offline" indicator on the hub.
- `admin/layout.tsx` nav now lists Cash Out, Corporate Dates, Training Guide,
  Month-End Inventory and Branding Requests (MGMT and above) — Staff Schedule is
  hub-only, per the feature brief.
- Suggested follow-up: wire the four `purge_*()` functions to pg_cron, and add a
  `created_by` stamp to branding requests from `/api/btb/me` once requesters are
  more than a name string.
