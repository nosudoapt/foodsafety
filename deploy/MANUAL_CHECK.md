# Manual check — everything changed so far

Run these in order. Each check says what you should see. Anything that differs is
a real bug — tell me the step number.

**Start the app**

```bash
cd foodsafety && npm run dev
```

Sign-in URLs: demo at `/btb/login`, console at `/btb/admin/login`.

---

## A. URL move (no stale paths)

| # | Do this | Expect |
|---|---|---|
| A1 | Visit `/between-the-buns` | Redirects (308) to `/btb/demo` |
| A2 | Visit `/between-the-buns/prep-list` | Redirects to `/btb/demo/prep-list` |
| A3 | Visit `/between-the-buns/login` | Redirects to `/btb/login` |
| A4 | Visit `/between-the-buns/temperatures?x=1` | Redirects with `?x=1` kept |
| A5 | Click every card on `/btb/demo` | Loads, no 404 |

## B. Team sign-in (individual employees only)

| # | Do this | Expect |
|---|---|---|
| B1 | `/btb/login` → an individual employee email + their own password | Lands on `/btb/demo` |
| B2 | `/btb/login` → `manager@btb.demo` + `BTB_PASSWORD` | Refused: “Shared workspace accounts can’t sign in here.” |
| B3 | Sign out | Back to `/btb/login` |

> Live sign-in is individual-only. Employee accounts are created in the console
> (`/btb/admin` → location → People) or by manager invitation; the employee sets
> their own password from the invitation link. Shared role accounts work only
> when the server sets `BTB_SHARED_LOGIN=1` — a local QA/Playwright convenience
> that must never be set in production.

## C. Console (super-admin)

| # | Do this | Expect |
|---|---|---|
| C1 | `/btb/admin/login` → `nitpreetsingh05@gmail.com` | Overview loads |
| C2 | Check the health table | Ancoats / Deansgate / Piccadilly / Console Test Site, with `—` where no data |
| C3 | Open a location | Address, timezone, page allow-list |
| C4 | Console account panel → change password | Success; other console sessions signed out |
| C5 | Sign in with the **old** password | Rejected |

## D. Staff least-privilege (the big one)

Staff account already created: **`staff.test@btb.test`** at **Console Test Site**,
16 pages granted, invite expires 2026-11-28.

| # | Do this | Expect |
|---|---|---|
| D1 | Open the invite link from the console | "Welcome, Test Staff" + correct email/location |
| D2 | Set a password → submit | Lands on `/btb/demo` as **Staff** |
| D3 | Look at the card count | **14** pages (not 34) |
| D4 | Open **Training & Progress** | 6 modules, each opens with sections |
| D5 | Open **Temperature Log** | Sheet renders, "Add off-form reading" shows a setup warning |
| D6 | Type `-20` in a freezer box | Cell turns **green** |
| D7 | Type `10` in the same box | Cell turns **red** |
| D8 | Type `4` in a cooler box | Cell turns **amber** |
| D9 | Save the sheet | "n saved" count increases |
| D10 | Reload | Saved cells stay, still coloured |
| D11 | Visit `/btb/demo/employees` directly | "This page isn't in your workspace" |
| D12 | Visit `/btb/demo/vault` directly | Same refusal |
| D13 | `curl` a non-granted API with the staff cookie | **403**, not data |

> D11–D13 are the ones that matter. A hidden card is not a permission — the
> server must refuse.

## E. What I fixed this session

| # | Bug | Fix |
|---|---|---|
| E1 | Training told staff "Use your assigned location workspace" | 4 training routes now opt into the location workspace |
| E2 | Green only appeared *after* saving a sheet | In-range drafts are green immediately |
| E3 | "All in range" badge was purple | Now green |
| E4 | Off-form readings silently dead | Explains standards aren't set up |
| E5 | Staff training library empty | 6 seeded topics published |

## F. Known limits (not bugs)

- **Off-form temperature readings** need your real standards. The schema
  forbids guessed food-safety limits. Sheet rows work today; tell me the
  cooking/cooling/hot-holding numbers and I'll seed them.
- **Invite emails** need `RESEND_API_KEY` + `BTB_EMAIL_FROM`; until then the
  console returns the link to copy.
- **Load speed**: ~300 ms per query warm, ~3.5 s cold, and the hub fires ~10.
  That's round-trip count, not data volume (12 prep rows total). Batching is the
  fix and it's in the plan below.
- **`Console Test Site`** is test-only. Say the word and I'll deactivate it.

---

## G. Phased plan for the six features

Do not start these until D passes — they'd sit on an unverified foundation.

### Phase 0 — Foundation (now)
Batch the hub queries (1 request instead of ~10). Target: hub under 800 ms warm.
Small, and it makes every later screen feel faster.

### Phase 1 — Staff clock in / out + hours (1–2 weeks)
Highest value, lowest risk. Tables already exist (`btb_time_entries`).
Clock in/out, break, manager approval, hours per week. Sheet rows already
support `pending` / `approved`.

### Phase 2 — Automated inventory + invoice tracker (2–3 weeks)
Stock balances, movements, supplier prices, reorder points. The invoice tracker
is the read side of the same model — build together.

### Phase 3 — GFS invoice reader with price changes (2 weeks)
PDF extraction → line items → price-change history. Depends on Phase 2's
supplier-price table. Costs AI calls; `btb_ai_usage` already meters them.

### Phase 4 — GST tracker (1 week)
Periods, filing status, reminders. Small and self-contained.

### Phase 5 — Bank statement reconciliation (2–3 weeks)
Statement import → match to invoices → allocations. Hardest; needs Phase 2–3
data to reconcile against.

### Testing rule for each phase
One location → demo with real staff + manager logins → sign-off → next location.
No phase goes live on a second site before the first is signed off.

---

## H. Decisions I need from you

1. **Temperature standards** for cooking / cooling / hot-holding / reheating /
   probe calibration (record type · equipment · min · max).
2. **Deactivate `Console Test Site`** after testing — yes or not yet.
3. **Resend keys** — set them, or keep the manual-link fallback?
4. **Phase 0 first?** I recommend it: it's small and everything after it is
   faster.
