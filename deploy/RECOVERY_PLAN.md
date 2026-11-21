# Recovery plan — get the BTB console working end to end

Status verified against the live database on 21 Nov 2026. Work top to bottom;
each step is safe to stop after.

---

## Where things actually stand

| Piece | State |
|---|---|
| `/btb/demo`, `/btb/login`, 308 legacy redirects | ✅ committed, working |
| Console schema steps 32, 33, 35 | ✅ applied and verified |
| Console auth, locations, people, invitations | ✅ committed |
| Page-grant enforcement | ⚠️ code shipped, **step 34 not applied** |
| Monitoring dashboard | ⚠️ code + SQL done, **uncommitted** |
| First console admin | ❌ **`btb_super_admins` is empty — nobody can sign in** |
| Offline replay (`btb_replay_prep_save`) | ❌ **function missing from the live DB** |
| Step 28 checksum | ❌ blocks `npm run db:migrate` |
| Time release (`btb_time_entries`) | ❌ absent (monitoring already degrades to 0) |

The two things that make the app *fail* rather than merely lack a feature are
the empty admin table and the missing replay function. Fix those first.

---

## Step 1 — Unblock the migration runner (5 min)

`npm run db:migrate` refuses to run because step 28's file no longer matches the
checksum recorded when it was applied.

```bash
npm run db:migrate:status        # shows 34 pending, and step 28 will error
```

**Why it happened:** `schema-inventory-master-list.sql` was edited after it was
applied. The schema itself is fine — only the file text drifted.

**Fix.** Confirm the drift is cosmetic before re-recording:

```bash
git log --oneline -- supabase/schema-inventory-master-list.sql
git diff HEAD -- supabase/schema-inventory-master-list.sql
```

- If the only changes are comments/whitespace → re-record the current checksum
  (do **not** re-run the SQL; it seeds a protected master list):

```sql
UPDATE _migrations
SET checksum = :new_sha256
WHERE step = 28;
```

  Get `:new_sha256` with `shasum -a 256 supabase/schema-inventory-master-list.sql`.
- If the diff changes **any SQL** → stop and review it by hand. Do not `--force`.

**Verify:** `npm run db:migrate:dry` should list step 34 as the only pending item.

---

## Step 2 — Install the offline-replay release (10 min)

This is the real bug. `fix-offline-replay-keys.sql` was applied to the repo but
**never registered in `migrations.json`**, so the live database has no
`btb_replay_prep_save`. Result: the demo prep list cannot save, and step 34
refuses to install because it depends on that function.

```bash
# 1. Register it in supabase/migrations.json, immediately after step 27
#    (it must run before 28 in a fresh database too):
#      { "step": 27.5 ... } is not allowed — use whole numbers.
```

Cleanest fix that keeps the numbering honest: **insert it as a new step and
renumber nothing.** The runner allows any positive integer:

1. Add to `supabase/migrations.json`:

```json
{
  "step": 36,
  "file": "fix-offline-replay-keys.sql",
  "description": "OFF-06 offline replay keys — temperature/prep replay receipts and btb_replay_prep_save. Prerequisite for step 34."
}
```

2. Because step 34 needs it, apply **36 before 34**:

```bash
npm run db:migrate:step -- 36
```

3. Confirm the function now exists:

```bash
psql "$SUPABASE_DB_URL" -c "select to_regprocedure('public.btb_replay_prep_save(date,text,jsonb,text)');"
```

> A fresh install from an empty database will run 36 after 35, and 34 will
> already have failed earlier. To keep fresh installs correct, also move
> step 34 **after** 36 by bumping its number to 37 in the manifest. The runner
> sorts by `step`, so this is the only ordering lever.

---

## Step 3 — Apply step 34 (5 min)

Now that `btb_employee_page_grants` (step 32) and `btb_replay_prep_save`
(step 36) both exist:

```bash
npm run db:migrate:step -- 34
```

This creates `btb_page_permissions` and moves page enforcement into SQL so the
PostgREST and transactional boundaries agree with the TypeScript matrix.

**Verify:**

```sql
select count(*) from btb_page_permissions;                      -- expect ~35
select public.btb_employee_page_grants('<any-employee-uuid>');   -- returns a set
```

Then run the parity test that pins SQL against `BTB_MATRIX`:

```bash
npm test 2>&1 | grep -i "page-capabilities"
```

---

## Step 4 — Create the first console admin (2 min)

Nothing in `/btb/admin` works without this.

```bash
node scripts/bootstrap-btb-admin.mjs
```

It prompts for email and password, prints the plan, and writes exactly one
`btb_super_admins` row. There is deliberately no default credential.

**Verify:**

```sql
select email, active, session_version, last_login_at from btb_super_admins;
```

Then sign in at `/btb/admin/login` and confirm the overview loads.

---

## Step 5 — Decide the managed locations (5 min)

Three existing sites were adopted into `btb_superadmin_locations`. Confirm all
three should be console-managed:

```sql
select l.name, s.created_at
from btb_superadmin_locations s join locations l on l.id = s.location_id
order by l.name;
```

Remove any site that should stay out of scope:

```sql
delete from btb_superadmin_locations where location_id = '<uuid>';
```

---

## Step 6 — Make invite email delivery real (15 min + deploy)

Invites queue into `btb_email_jobs` but only send if all three are true:

1. `RESEND_API_KEY` set (server-only).
2. `BTB_EMAIL_FROM` set to a Resend-verified sender.
3. `/api/cron/btb-daily-reports` actually scheduled.

Item 3 is done in `vercel.json` (`0 14 * * *`) but **is uncommitted** — it only
takes effect once deployed. Same for `CRON_SECRET`.

**Fallback that already works:** if Resend is unconfigured, the "add person"
response returns the invite link so you can send it by hand. Verify this path
today, before depending on mail.

**Verify end to end:**

```bash
# after deploy, force a drain
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/btb-daily-reports
```

Expect `{"enqueued":0,"claimed":N,"accepted":N,...}`.

---

## Step 7 — Commit the uncommitted work (10 min)

Everything from the monitoring/housekeeping session is still in the working
tree. Commit it before touching more code so it is bisectable:

```bash
git add supabase/schema-btb-admin-monitoring.sql supabase/README.md supabase/migrations.json \
        src/lib/btb-admin.ts src/components/btb-admin/Overview.tsx \
        src/app/btb/admin src/app/btb-console.css src/app/api/btb/admin/monitoring \
        tests/btb-admin-monitoring.test.mjs tests/btb-console-schedule.test.ts \
        tests/helpers/btb-admin-database.mjs vercel.json \
        deploy/ UI_HANDOFF.md CLIENT_ACCEPTANCE_WALKTHROUGH.md
git commit -m "Add BTB console monitoring dashboard, cron schedule and docs"
```

Then confirm the suite is green on a clean tree:

```bash
npm test && npm run build
```

---

## Step 8 — Prove it end to end (20 min)

Do this in order; each check isolates one layer.

1. **Legacy links** — `curl -sI localhost:5001/between-the-buns/prep-list`
   → `308` to `/btb/demo/prep-list`, query string preserved.
2. **Demo door** — `/btb/login`, `manager@btb.demo` → hub at `/btb/demo`, every
   card opens.
3. **Console door** — `/btb/admin/login` with the Step 4 admin → overview,
   locations list, and the operational-health table all render.
4. **Invite** — add a person at a location with a page allow-list; open the
   returned link; set a password; land on `/btb/demo`.
5. **Least privilege** — that person sees only granted cards, and calling a
   non-granted page's API directly returns 403 (not just a hidden card).
6. **Monitoring truth** — a location with activity shows non-zero last
   activity / storage / AI%; one with no activity shows `—`, not an error.
7. **Offline prep save** — save the prep sheet twice from the same tab; the
   second save is a receipt replay, not a duplicate row.

---

## Step 9 — The four pre-existing e2e failures (optional)

`btb-reminders` ×3 and one `btb.spec` permission-retry failure reproduce on a
clean `HEAD`, so they are not caused by this work. Fix them **after** the
console is live, as their own change:

```bash
npx playwright test e2e/btb-reminders.spec.ts --reporter=list
```

They are almost certainly fixture drift from the earlier `location_id` work —
worth fixing, but not a blocker for the console.

---

## Definition of done

- [ ] `npm run db:migrate` runs clean, no pending steps, no need for `--force`
- [ ] `to_regprocedure('public.btb_replay_prep_save')` is not null
- [ ] `select count(*) from btb_page_permissions` > 0
- [ ] Exactly one active row in `btb_super_admins`
- [ ] `/btb/admin/login` → overview renders real per-location numbers
- [ ] An invited person signs in and sees only their granted pages
- [ ] A direct API call to a non-granted page returns 403
- [ ] `npm test` and `npm run build` pass on a clean tree
- [ ] `curl -I /between-the-buns/prep-list` → 308

---

## Things that will stay imperfect (accept, don't chase)

- **Per-location page views** are best-effort: only single-location staff get
  attributed; `btb_events` is the authoritative per-location signal.
- **"Compute power"** is AI-quota usage, not CPU metering — there is no
  infrastructure telemetry in the app.
- **`/platform`** remains a separate vendor-level passcode surface. It is a
  different trust level from the tenant console; do not merge them without a
  deliberate decision.
- **Legacy pages have no `location_id`**, so a per-location page grant filters
  *visibility*, not the underlying rows. Say so in the console UI rather than
  implying per-site data isolation.