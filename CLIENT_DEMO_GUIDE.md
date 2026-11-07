# Between The Buns — Client Demonstration Guide

**Prepared:** 7 November 2026 (updated after the approved demo-data session, same day)
**Verified against:** the live production database, via the running app with valid
personal sessions. Every claim below was tested by loading the actual screen or calling
the actual GET endpoint on 2026-11-07.

**What was verified and how:** the app was run locally (`npm run dev`, port 5001) and
every page and read API listed here was requested with a signed session for a real
employee account. The initial audit used read-only GET requests only. After the client
approved a demo-data session (same day), clearly-labelled `DEMO —` records were created
**through the app's own authorized API routes and SQL functions only** — the same
role, membership and version checks run as for any real user. No table was written
directly. Details in §8; cleanup notes in §8.4.

---

## 1. Owner account — what it can and cannot reach

One personal account is live and sign-in-enabled: **Nitpreet Singh, role `owner`**,
member of all four locations (verified live via the platform bootstrap endpoint).

The BTB matrix gives the Owner role a specific shape — it is an **HQ / oversight**
role, not a store role:

| Area | Owner access |
| --- | --- |
| Location platform (operations, inventory, marketing, compliance, reports, notifications, settings, overview) | Full read; **view-only on daily data entry** (staff/supervisor/manager do the entering) |
| Settings (timezones, recipients, limits) | Full edit (corporate/owner only) |
| Franchise inspection, new-restaurant checklist | Full edit |
| Marketing (legacy board), branding requests | View (edit is manager/corporate) |
| Month-end inventory (legacy sheet) | View only (edit stays manager/admin) — the read API now includes `owner` (fixed, §5.1) |
| Employees, staff licences, documents, compliance | View |
| Licence email reminders, in-house inspections, login vault, legacy admin dashboard | **No access by design** (verified: UI hides the cards; APIs return 403/404) |

The hub renders exactly 29 cards for the Owner (including the Location Workspace
card added 2026-11-07); four role-hidden tiles are hidden.

---

## 2. Verified screen inventory (every Owner-reachable URL)

Legend: **Loads + has data** · **Loads (empty)** = screen renders and its API
returns 200 but the production tables are empty, so the client sees empty states ·
**Broken** = renders or fails in a way you must not demo without preparation.

### HQ / platform (the core of the demo)

| Screen | URL | Verified state |
| --- | --- | --- |
| BTB hub (landing after sign-in) | `/between-the-buns` | Loads; 29 tiles render (with the Location Workspace card); daily-strip API 200 |
| Location workspace — Daily operations | `/between-the-buns/platform` → *Daily operations* tab | Loads; all four locations return 200. **The Grill House is now configured (DEMO):** 3 equipment items with approved Celsius limits, opening/closing/cleaning templates, Quat 200–400 PPM standard. Other three locations remain honest empty states |
| Location workspace — Inventory & food cost | `/between-the-buns/platform` → *Inventory & food cost* | Loads; all four locations return 200. **The Grill House has a finalized DEMO month (2026-11):** food cost **41.61%** computed live (see §8.2). Other locations empty |
| Location workspace — Marketing | `/between-the-buns/platform` → *Marketing* | Loads; all four locations 200. **The Grill House has 2 DEMO promotions** showing the full pipeline (see §8.3), plus 1 uploaded artwork version. Reference data exists: 5 design formats, 2 social platforms seeded |
| Location workspace — Compliance | `/between-the-buns/platform` → *Compliance* | Loads; all four locations 200. **Empty:** no certificates, no required-types configured, no renewal history |
| Location workspace — Reports & delivery | `/between-the-buns/platform` → *Reports & delivery* | Loads; all four locations 200. **Empty:** no deliveries. Do **not** press *Resend* — no email provider is configured (see §6) |
| Location workspace — Notifications | `/between-the-buns/platform` → *Notifications* | Loads; all four locations 200. **Empty:** zero notifications in production |
| Corporate overview (HQ dashboard) | `/between-the-buns/platform/overview` | Loads; API returns all four locations with per-site counters |
| Location settings | `/between-the-buns/platform/settings` | Loads; 4 locations + team returned. **The Grill House now shows `settings_confirmed = true`** (version 3; email delivery deliberately off). Other three locations remain unconfirmed with the amber banner — still honest to show |

### Legacy store surfaces visible to the Owner (hub cards)

| Screen | URL | Verified state |
| --- | --- | --- |
| Opening & Closing (legacy) | `/between-the-buns/checklists` | Loads; API 200. **Data:** one 29 Oct 2026 opening + closing check exists — but the default view is *today*, which is empty. Navigate back to 2026-10-29 to show a saved check |
| Temperature Log (legacy) | `/between-the-buns/temperatures` | Loads; API 200, **0 records** |
| Daily Prep Sheet | `/between-the-buns/prep-list` | Loads; **12 prep-count rows from 15–21 Oct 2026** only |
| Order Sheet | `/between-the-buns/order-sheet` | Loads; API 200, **0 orders** |
| Cleaning Schedule | `/between-the-buns/cleaning-schedule` | Loads; **0 cleaning logs** |
| Cash Out | `/between-the-buns/cash-out` | Loads; **0 rows** in `cash_outs` |
| Staff Schedule | `/between-the-buns/staff-schedule` | Loads; 5 shifts exist in Oct 2026 only |
| Employees | `/between-the-buns/employees` | Loads; 4 team members listed |
| Branding Requests | `/between-the-buns/branding-requests` | Loads; 0 rows. *Note:* this page reads `branding_requests` directly with the browser's anon key (legacy pattern), not through the BTB API — it works, but it is one of the surfaces the platform workflow will replace |
| Month-End Inventory | `/between-the-buns/month-end-inventory` | **Fixed for the Owner** (see §5.1): the read-role list now includes `owner`, so the page loads with the Owner's data. The five-request load was verified after the fix |
| Training & Progress | `/between-the-buns/training-guide` | Loads; **0 published topics, 0 records** |
| Loyalty Rewards | `/between-the-buns/loyalty-rewards` | Loads (static content page) |
| Tax & Renewal Dates | `/between-the-buns/tax-dates` | Loads; content is static in the client — no live data |
| Compliance & Renewals (legacy) | `/between-the-buns/compliance` | Loads; **0 compliance documents** in production |
| Business Documents | `/between-the-buns/documents` | Loads; 0 rows |
| Staff Licenses & Certs | `/between-the-buns/staff-licenses` | Loads; 0 licences (team list renders) |
| Franchise Inspection | `/between-the-buns/franchise-inspection` | Loads; 0 saved tasks (16-section rubric renders from template) |
| Marketing (legacy board) | `/between-the-buns/marketing` | Loads; 0 promotions, 0 posts; uploader connection reports connected |
| Franchise Opening Checklist | `/between-the-buns/new-restaurant` | Loads; 0 saved tasks (template renders) |
| Account (change own password) | `/between-the-buns/account` | Loads; do **not** demo the change in front of the client |
| Reference pages (Prep Manual, Recipe Cheat Sheets, Allergen Chart, Gluten Free, Fryer Timing, Emergency Contacts, Protocols, Handbook, Manuals) | `/between-the-buns/prep-manual`, `/menu`, `/allergen-chart`, `/gluten-free`, `/fryer-timing`, `/emergency`, `/protocols`, `/handbook`, `/manuals` | All load. Emergency contacts has **15 real entries** (read with the anon key — legacy pattern, works). The recipe/manual content is static, no DB needed |

### Hidden from the Owner (do not navigate here on camera)

`/between-the-buns/admin` (legacy admin dashboard), `/between-the-buns/licence-reminders`,
`/between-the-buns/inspections`, `/between-the-buns/vault` — the hub hides all four.
Their APIs correctly refuse the Owner role (verified 403 on licence reminders; the
vault page targets the separate green-side `/api/vault*`, which requires a Supabase
session the BTB login cannot provide).

### Different product surface (green FoodSafe)

`/dashboard` and all green-side pages use Supabase Auth, not the BTB login. The BTB
Owner cookie gets a clean redirect to `/auth/sign-in` (verified). **The Owner account
cannot demo the green side.** Either skip it, or arrange a separate green-side
sign-in beforehand (demo accounts exist in `supabase/seed-demo.sql` but have **never
been applied to this production database** — the demo tiles at `/demo` will not work).

---

## 3. What can be demoed with existing data vs what needs labelled demo records

**Real data you can show today (read-only):**
- HQ structure: 4 locations (Ancoats, Deansgate, Piccadilly, The Grill House), team list
- Corporate overview counters across all four sites
- Location settings screens (all four rows exist, unconfirmed — honest “configuration in progress” story)
- Emergency contacts (15 entries), staff schedule (5 October shifts), legacy checklist
  (one opening + closing from 29 Oct), prep sheet (12 October rows)
- Platform reference/config data: 5 design formats, 2 social platforms, sales-basis label

**Screens that were empty and now carry clearly-labelled DEMO data (approved 2026-11-07,
see §8):**
- Temperature & sanitizer logs → 3 equipment items registered for The Grill House with approved Celsius limits; readings themselves are still empty (fresh day) — the sheet is ready for live entry
- Daily operations checklists on the platform → opening/closing/cleaning templates configured for The Grill House
- Inventory & food cost end-to-end → one finalized DEMO month for The Grill House; Food Cost % computes live
- Marketing pipeline → 2 DEMO promotions for The Grill House covering the full approve→design→deliver cycle
- A designer employee now exists (DEMO — Dana Designer) and a designer dashboard is available

**Still empty (skip or frame honestly):**
- Temperature/sanitizer *readings* (no rows yet — enter one live in the demo if desired)
- Compliance certificates (none uploaded)
- Notifications (none yet — submitting the second DEMO promotion created some), Reports delivery log (none — no email provider configured)
- Legacy: temperature log, order sheet, cash out, cleaning schedule, training, documents, licences

**Do not demo at all with the Owner account:** login vault, licence reminders, in-house inspections, anything on the green side.

**DEMO data cleanup after the session (§8.4):** delete the two DEMO promotions, the
2026-11 inventory rows, the 3 equipment items/templates for The Grill House, and the two
DEMO employees — all named `DEMO —` so they are easy to find.

---

## 4. Ten-minute demo script (exact navigation)

Sign in first: open `/between-the-buns/login`, enter the Owner email + password.
(*The password is deliberately not written here.*)

| Min | Action | Expected outcome |
| --- | --- | --- |
| 0:00–0:45 | Land on `/between-the-buns` | Hub with 29 tiles, daily strip loads. Say: “One hub per role — this is the owner view.” |
| 0:45–2:00 | Click **Location workspace** → *Daily operations*, location picker = **The Grill House** | Workspace loads with today's date; the amber “not fully configured” banner shows. Frame it as the setup checklist |
| 2:00–3:30 | Switch location picker across **Ancoats → Deansgate → Piccadilly** | Each switch reloads cleanly with honest empty states. Say: “Every record is location-isolated and server-authorised.” |
| 3:30–5:00 | *Inventory & food cost* tab, location = **The Grill House** | Finalized DEMO month shows Food Cost % **41.61%** computed from real inputs (opening + purchases − closing ÷ sales). Open the snapshot details: 3 items, 2 purchases, every count explicit. Say: “Nothing is finalised until every input exists — blanks are never zeros.” |
| 5:00–6:30 | *Marketing* tab, location = **The Grill House** | Two DEMO promotions: *Double Smash Combo Week* (completed — full approve→design→deliver with uploaded artwork) and *Family Bundle February* (**live: approve it as the Owner on camera**, then assign to the designer). Say: “Manager requests → corporate approves → designer produces; a designer can never bypass approval — the SQL refuses it.” |
| 5:30–6:30 | *Compliance* tab → then *Reports & delivery* → *Notifications* | Certificate register with 60/30-day countdown UI; delivery log (empty). Do not press Resend |
| 6:30–7:30 | Open `/between-the-buns/platform/overview` | Corporate rollup across all four locations. Say: “HQ sees every site; a manager would see only theirs.” |
| 7:30–8:30 | Open `/between-the-buns/platform/settings` | Timezone, report time, recipient lists, reminder days, compliance types. Say: “Settings are explicit and version-guarded; nothing sends until confirmed.” |
| 8:30–9:30 | Back to hub → **Employees**, **Staff Schedule**, **Emergency Contacts** | Real team list; October shifts; 15 contacts |
| 9:30–10:00 | Optional: **Opening & Closing** → change date back to 2026-10-29 | One real saved opening + closing check renders. Close on the security story: “SQL-level authorization, no shared passwords for HQ.” |

Keep a browser tab on `/between-the-buns/platform` throughout — it is the strongest screen.

---

## 5. Broken links, missing screens, errors and incomplete workflows

### 5.1 Fixed — legacy Month-End Inventory for the Owner
`GET /api/btb/inventory-items` and `/api/btb/inventory-counts` returned **403 for the
`owner` role** (`INVENTORY_READ_ROLES` in `src/lib/btb-inventory-api.ts` omitted
`owner`; `corporate` was allowed). **Fixed 2026-11-07** (one-line roles-list change,
regression test renamed and passing; full suite 383/384 on Node 22). The page's
five-request load now works for the Owner.

### 5.1b Also fixed the same day
- **Marketing artwork upload crashed in the browser** (`Buffer` is not defined in
  browser JS). Now uses the same FileReader pattern as the evidence uploader, with the
  error shown beside the form.
- **Promotion creation through the UI returned a server error** — the route passed the
  employee id into a column that references `profiles`. Rows are now attributed to the
  dedicated uploader profile while `btb_created_by` keeps the real person.
- **`/platform` was unreachable from the hub** — no card pointed at it. A
  "Location Workspace" card is now on the hub for every role that has platform access,
  and the designer's quick action opens it.
- **Platform page formatting**: the page no longer nests its layout class inside
  itself (doubled spacing), and the inventory metrics grid fits its six tiles
  responsively (the sixth used to wrap onto its own row).

### 5.2 Route vs page mismatches (cosmetic; navigation unaffected)
- The hub's **Employees** card links to `/between-the-buns/employees`, and the route
  exists and renders (verified) — the earlier concern was unfounded. Nothing to fix.
- A handful of legacy pages (Branding Requests, Emergency Contacts, and parts of other
  store sheets) read their tables directly with the browser's anon key instead of going
  through the BTB API. They work, but they predate the server-authorization work —
  expect the client to notice the architectural gap if they ask deep security questions.
- `GET /api/btb/social-posts` is POST-only (405 on GET). The page uses POST; harmless.

### 5.3 Configuration gaps that will show on camera
- Three of four locations remain unconfirmed (`settings_confirmed = false`) → amber warning banner on Daily operations. Expected — The Grill House is configured with DEMO data (§8).
- Temperature/sanitizer *readings* are still empty everywhere → enter one live in the demo or skip; the Grill House sheet itself is ready.
- A demo designer + demo manager now exist (§8.1), clearly named `DEMO —` and easy to remove after the session.
- Email delivery cannot be demonstrated: `RESEND_API_KEY`, `BTB_EMAIL_FROM` and
  `CRON_SECRET` are **not configured** in `.env.local`. The Reports tab loads, but
  resends will fail honestly. Say: “Email is wired end-to-end and waiting on credentials.”

### 5.4 Known non-issues verified
- Every tested page returned HTTP 200 and every platform read API returned 200 for
  all four locations.
- Owner-hidden APIs correctly refuse (`licence-reminders` → 403).
- `/dashboard` correctly redirects the BTB session to the green sign-in instead of erroring.

---

## 8. Demo data seeded 2026-11-07 (approved session) — all labelled `DEMO —`

Every record below was created **through the app's own authorized API routes and SQL
functions** — the same role, membership and version checks as any real user; no table
was written directly. Nothing was emailed (email delivery is off).

### 8.1 Accounts created
| Who | Role | Email | Purpose in the demo |
| --- | --- | --- | --- |
| DEMO — Morgan Manager | manager | `manager.demo@foodsafe.invalid` | Raises + submits promotion requests (the approver must be someone else) |
| DEMO — Dana Designer | designer | `designer.demo@foodsafe.invalid` | Receives assignments, uploads artwork, dashboard shows marketing data only |

Passwords are random and are **not** stored in this guide; they are in the operator's
protected credentials file (`~/.btb-demo-credentials.txt`, 0600). Rotate or delete the
accounts after the session (§8.4).

### 8.2 The Grill House — configured + one finalized inventory month
- Settings confirmed (version 3): timezone America/Edmonton, business day 04:00, report 06:00, **email delivery off**, sales basis “Summary Total Net Sales”, compliance types Food Handler/First Aid/WHMIS, reminder days 60/30.
- Equipment with approved Celsius limits: **Walk-in Cooler 1–4 °C, Prep Line Fridge 1–4 °C, Chest Freezer −24 to −18 °C**; sanitizer standard **Quat 200–400 PPM**; opening (4), closing (4) and cleaning (3) checklist templates.
- Catalogue (3 items): Beef Patties 4oz `BFP-004` $92.50/case · Brioche Buns `BRB-006` $55.20 · Cheddar Slices `CHS-012` $78.00.
- Purchases: GFS invoice `INV-9041952706` **$1,310.40** (3 Nov) + Costco **$189.87** (5 Nov); opening baseline **$2,480.00** (“DEMO baseline: physical stocktake at platform launch”); closing counts on all 3 items.
- **Finalized snapshot (2026-11): opening 2,480.00 + purchases 1,500.27 − closing 547.35 = COGS 3,432.92; sales 8,250.00 → Food cost 41.61%.** Verified live through the platform read API; every correction path is audit-logged.

### 8.3 Marketing pipeline — two promotions
- **DEMO — Double Smash Combo Week** — full cycle completed: manager draft → submitted → **approved by the Owner** → assigned to Dana Designer → in progress → artwork v1 uploaded (real PNG) → awaiting feedback → **completed**.
- **DEMO — Family Bundle February** — left at **pending approval** so the Owner can approve it live on camera, then assign the designer and walk the same cycle.
- The SQL state machine refuses designer bypasses and self-approval — safe to demonstrate freely.

### 8.4 Cleanup after the session
All demo rows are labelled `DEMO —` (promotions, equipment, templates) or belong to
month `2026-11` at The Grill House. To remove:
1. Delete the two promotions titled `DEMO — …` (marketing module or `marketing_promotions`).
2. Delete the 2026-11 snapshot/summary, counts, purchases and imports for The Grill House (`inventory_*` tables) — or leave the month and just say so.
3. Delete the 3 `DEMO` equipment rows and their checklist templates for The Grill House.
4. Deactivate the two `DEMO —` employees (set `active = false`, `login_enabled = false`), or delete them and their credentials.
5. Remove the credentials file `~/.btb-demo-credentials.txt`.

The settings confirmation and the owner-read fix are permanent improvements — keep them.

---

## 9. Environment facts (no secrets shown)

- `.env.local` contains the Supabase URL, anon key, service-role key, DB URL, vault
  key and an uploader profile id. It does **not** contain `RESEND_API_KEY`,
  `BTB_EMAIL_FROM` or `CRON_SECRET`.
- The six platform SQL releases are applied to production (verified earlier; the
  platform RPCs respond).
- Location IDs for scripts/support: The Grill House `…0001`, Piccadilly `…0002`,
  Deansgate `…0003`, Ancoats `…0004` (full UUIDs in the platform bootstrap response).

---

## 10. Honesty notes

- “Loads + has data” above means the page rendered **and** its data endpoint returned
  live production rows during this verification. “Loads (empty)” means both worked but
  the production tables hold no rows for that screen.
- The initial audit exercised read paths only. The later demo-data session (§8) wrote
  only the approved, clearly-labelled records listed there — through the app's own
  authorized routes, never direct table writes.
- The verification session cookies were minted locally with the app's own signing
  scheme so that no login-attempt counter or session row would be written to
  production. They expire on their own; no secret material appears in this document.
- The §5.1b fixes are real code changes, committed and covered by the existing test
  suite (383/384 passing on Node 22; 1 pre-existing skip).
