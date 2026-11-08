# Between The Buns — Client Acceptance Walkthrough

**Prepared for:** the owner and team at Between The Buns (BTB)
**Prepared by:** engineering, on your instruction
**Verified against:** `ce75753` (branch `main`, equal to `origin/main` at time of audit)
**Verification date:** 8–9 November 2026
**Companion document:** `CLIENT_DEMO_GUIDE.md` — the short "what to click on demo day" guide

---

## Read this first

This is an audit, not a sales sheet. Its job is to tell you what works, what does not, and what I would not put in front of a customer yet.

Every claim below was produced by running the real application against the real database on
the commit named above. Where a claim could not be tested, it is marked as such rather than
softened. Three findings are serious enough that they appear before the walkthrough, in the
order that should matter to you:

1. **§0 — CRITICAL: the code repository is public, and the public database key can read and
   delete business records.** True right now. Reversible.
2. **§1 — The Settings screen cannot be saved by any role.** The interface offers the form
   to the wrong roles; the server refuses every one of them.
3. **§2 — Marketing has two identities for one person.** Runs correctly only while the
   data holds a lucky coincidence.

No code was changed and nothing was pushed during this audit.

<!--CHUNK-->

---

## 0. CRITICAL — the repository is public, and the public database key is writable

Confirmed before any functional review, because this is the only finding that can destroy
data irreversibly tomorrow morning.

### 0.1 What is exposed

The GitHub repository `nosudoapt/foodsafety` is **public** — the GitHub API returns
`"isPrivate": false` to an unauthenticated request. A public repository means anyone,
with no account and no invitation, can read every file in it. It also means any key that
reaches that repository must be treated as already in a stranger's hands.

The database uses Supabase's standard two-key model:

- **service-role key** — bypasses row-level security. Must only ever exist on the server.
- **anon key** — ships to the browser by design, and is safe *only* because row-level
  security policies are supposed to decide what it can touch.

The anon key itself is not the defect. **The defect is that the policies grant it full
read and write on 33 business tables.**

Statements were executed against the production database as the `anon` role — the exact
role the browser key maps to:

| Result | Count |
| --- | --- |
| Tables `anon` can **read** | **33** |
| Tables `anon` can **delete** | **33** (identical set) |
| Tables `anon` can insert/update (policy is `FOR ALL USING (true)`) | **33** |
| Tables `anon` is correctly denied | 41 — the platform and inventory tables |

That is not a stray rule on a scratch table. It is the entire legacy business surface:

```
allergen_records      handbook_documents    prep_counts            staff_shifts
branding_requests     handbook_signatures   print_manuals          temperature_records
btb_checklists        inhouse_inspections    profiles               training_records
cash_outs             location_members        role_page_access
cleaning_logs         locations              staff_licenses   corporate_dates
cleaning_records      login_vault            staff_members    corporate_inspections
compliance_documents  new_restaurant_tasks   ...                    corrective_actions
delivery_records      emergency_contacts
equipment             daily_checks           order_sheets
operational_protocols pest_control
```

Two of them deserve naming separately.

**`login_vault`** holds the AES-256-GCM ciphertext of vendor, bank and delivery-platform
credentials. The public key can read it, overwrite it, and delete it. It is
**empty today — 0 rows** — so no real credential is in the wrong hands *yet*. The policy is
a loaded gun; the chamber happens to be empty. That is luck, not design, and the luck ends
the day the vault is populated.

**`role_page_access`** is the matrix that decides which page each role may see. It holds
**126 rows**, and the public key can both read and rewrite them. Read/write on the
permission table is privilege escalation, however small the table looks.

### 0.2 It is reachable over the internet, not just from a database shell

A database-role test can be waved away with "you would already need database access". So
the same test was repeated over HTTPS against the production Supabase REST endpoint,
sending **only the anon key that ships in the browser bundle** and nothing else:

| Table | HTTP | Rows visible to a stranger |
| --- | --- | --- |
| `staff_members` | 200 | 2 |
| `role_page_access` | 206 | 126 |
| `emergency_contacts` | 206 | 15 |
| `prep_counts` | 206 | 12 |
| `corporate_dates` | 200 | 1 |
| `login_vault`, `profiles`, `cash_outs`, `staff_licenses`, `compliance_documents` | 200 | 0 — readable, currently empty |
| `inventory_*`, `btb_*`, `training_*` | **401** | correctly refused |

Read the third column again. A stranger with no account can download the staff list, the
emergency-contact list, the role/permission matrix, the prep counts and the corporate
calendar. "But those pages require a login" is the misunderstanding this test exists to
correct: **the login protects the web page, not the database endpoint behind it.** The
endpoint answers to the public key directly, and never asks for a password.

Write access was proven separately, without altering a single row: a `DELETE` and a `PATCH`
carrying an impossible filter (one that matches nothing) were sent with the public key. A
refusal returns `401` or `403`. The endpoint returned **`204 No Content`** and reported
**0 rows affected**, with row counts identical before and after:

```
emergency_contacts   DELETE 204  matched=0  rows 15 -> 15
prep_counts          DELETE 204  matched=0  rows 12 -> 12
staff_members        DELETE 204  matched=0  rows  2 -> 2
role_page_access     PATCH  204  matched=0  rows 126 -> 126
```

`204` on a filter that matches nothing is the definitive proof that the *permission* is
granted to the public and applies to every row. `401` would have been a denial.

### 0.3 Root cause — committed code, not production drift

It would be convenient to call this a misconfiguration someone will tidy up in the
Supabase dashboard. It is not, and it would return. It ships with the repository:

1. **`supabase/schema-btb-public.sql` is migration step 8 of 27**, per
   `supabase/migrations.json`. Every `db:migrate` applies it. Its own header reads
   `demo-grade RLS`, `removes per-row / per-user security`, `NOT production row security`.
   The body then loops over the legacy tables and, for each one, runs
   `ENABLE ROW LEVEL SECURITY` followed by
   `CREATE POLICY "<table>_btb_public" ... FOR ALL USING (true) WITH CHECK (true)`.
   Enabling RLS and then attaching a policy that is always true is not protection; it is
   the appearance of protection.
2. **Later steps re-open it.** Steps 16, 21, 24, 25 and 26 each add fresh `USING (true)`
   policies (`schema-cash-out.sql`, `schema-branding-requests.sql`, and the three
   `schema-inventory-*.sql`). Re-running the chain recreates the hole.
3. **Step 27 re-opens the permission matrix specifically.** `schema-role-page-access.sql`
   is the *last* step in the chain and contains, unconditionally:
   `DROP POLICY IF EXISTS "rpa_public_all" ON role_page_access;`
   `CREATE POLICY "rpa_public_all" ON role_page_access FOR ALL USING (true) WITH CHECK (true);`
   That is why `role_page_access` has 126 publicly readable rows today.
4. **The fix exists but never ships.** `deploy/04-security-hardening.sql` is a careful,
   guarded, idempotent script that revokes `anon`/`authenticated`/`PUBLIC` privileges on
   the inventory tables and drops their permissive policies. It is **not listed in
   `supabase/migrations.json`**; it is a file a human must remember to run. Production
   shows the result of that: the `inventory_*` tables return `401` (their grants were
   revoked), while the legacy tables remain wide open.
5. **The vault depends on the hole.** `src/lib/vault-server.ts` reads `login_vault` through
   the anon client deliberately, and its comment says so: `DB access uses the anon client
   (login_vault RLS is public on the BTB demo — see supabase/schema-btb-public.sql)`.
   Closing the policy alone would break credential storage, so the correct fix is a
   change, not a checkbox.

### 0.4 What was checked, so the risk is neither over- nor under-stated

Verified **not** exposed:

- **No secret value is in Git history.** `.env.local` is untracked and has never been
  committed. A full-history content search for the service-role key, the database URL, the
  vault key and the anon key found **0 commits** containing any one of them. `.env.example`
  contains placeholders only: its URL is not a real Supabase project host, its anon value is
  not a JWT, and its database value carries no credential.
- **The new platform is sound.** All 18 `btb_platform_*` functions return
  `anon_exec: false`; every `btb_*` table denies `anon`; the authorization boundary is SQL
  (`btb_platform_actor` → `btb_platform_assert`: role capability, active location check, and an
  `btb_location_access` membership check). Platform data is not exposed by this hole.

So the honest summary is narrow and serious: **the publicly shipped browser key can read
and delete legacy business rows over the internet, including the ones the credential vault
and the permission matrix sit on, and it will be able to again after any deploy.**

### 0.5 What the owner should do now (about 20 minutes, to stop the bleeding)

1. **Rotate the anon key** in Supabase, then redeploy. The old key has sat on a public
   repository and in a public bundle; treat it as burnt. Rotation alone does not close the
   hole, because the new key inherits the same policies, but it invalidates any copy already
   scraped from GitHub.
2. **Apply the hardening that already exists**: run `deploy/04-security-hardening.sql` in
   the Supabase SQL editor, then repeat the check in §0.7. It closes the inventory tables.
3. **Do not run `npm run db:migrate`** until the two regression steps in §0.6 are fixed, or
   step 27 will re-open the permission matrix.

### 0.6 The permanent fix (engineering, about half a day)

- Delete every `<table>_btb_public` / `<table>_public_all` policy in `schema-btb-public.sql`
  and the per-table schema files, and replace them with policies scoped to the authenticated
  BTB identity, not the `public` role.
- Fix migration step 27 so it cannot re-create `rpa_public_all`, and make the migration chain
  order the hardening **last**. Today it is not in the chain at all.
- Move `login_vault` access to a server-only route that uses the service-role key behind the
  existing `btbCanView("vault", role)` check, and remove the anon-client dependency in
  `vault-server.ts`.
- Add a regression test that, running as `anon`, asserts **0** readable and **0** deletable
  rows across the legacy tables. This is the part that prevents silent recurrence: today the
  whole suite is green while the door is open, because no test asserts the negative.
- Ship the hardening as a migration, not a script in `deploy/` that a human must remember.

### 0.7 Verify it yourself (60 seconds, read-only, no secret printed)

In the Supabase SQL editor, or any client holding **only the public anon key**:

```sql
select count(*) from login_vault;         -- safe answer: a permission error
select count(*) from role_page_access;    -- safe answer: a permission error
select count(*) from emergency_contacts;  -- safe answer: a permission error
```

If any of those returns a number instead of an error, the public key can read that table and
the finding stands. Use `select` only while checking — a read proves the same thing as a
write and destroys nothing. Do not use `delete`, `update` or `insert` to "test" this.

---

## 1. The Settings screen cannot be saved by any role

This is the most consequential functional defect: **it blocks the demo it was meant to enable.**
Location settings are the switchboard for everything else. Until a location is *confirmed*
here, its daily report cannot be enqueued and its compliance reminders have no recipients.

### 1.1 What "Settings" controls

One row per location in `btb_location_settings`, edited on
`/between-the-buns/platform/settings`:

- timezone and the business-day start time
- report time, and `reports_enabled` (turns the daily emailed report on or off)
- recipient lists: manager, owner, additional, compliance
- `reminder_days` (60/30) and `compliance_types` (Food Handler, First Aid, WHMIS, ...)
- the sales basis, which fixes the food-cost denominator for the month
- `settings_confirmed` — the acknowledgement flag

The database enforces a hard rule on this row:

```sql
CHECK (NOT reports_enabled OR (timezone IS NOT NULL AND report_time IS NOT NULL AND
  cardinality(manager_emails||owner_emails||additional_emails)>0 AND settings_confirmed))
```

So a location cannot switch reports on until someone has filled in a timezone, a report
time, at least one recipient, **and pressed confirm**. If the confirmation screen does not
work, reports cannot be enabled anywhere. That is the thread this section pulls.

### 1.2 One screen, two independent sources of truth

The two layers that must agree are **the SQL authorization function** and **the
TypeScript permission matrix** that the screen reads. They disagree in opposite directions.

**Source A — the database, which is the real boundary.**
`btb_platform_settings` opens with its own role check, and it is not the same group as the
platform gate:

```sql
actor:=btb_platform_actor(p_actor,p_session);
IF actor.role NOT IN ('corporate','owner') THEN
  RAISE EXCEPTION 'Corporate settings required' USING ERRCODE='42501';
END IF;
```

Confirmed by executing it, once per role, inside a transaction that was always rolled back:

| Role | Calling `btb_platform_settings` |
| --- | --- |
| `owner` | **allowed** — proceeds to the version check |
| `corporate` | allowed (no seeded account to test; same branch as owner) |
| `manager` | `Corporate settings required` |
| `supervisor` | `Corporate settings required` |
| `staff` | `Corporate settings required` |
| `designer` | `Corporate settings required` |

**Source B — the interface, which decides who may even see the form.**
`src/lib/btb-access.ts:120` maps the whole platform feature to the *operations* edit group:

```ts
// OPS_EDIT = staff, supervisor, manager  (corporate + owner are view-only on operations)
platform: { view: PLATFORM, edit: OPS_EDIT },
```

`BtbFeatureGate` derives `readOnly` from exactly that, and the settings page renders the form
only when it is false:

```tsx
export default function SettingsPage() {
  return <BtbFeatureGate feature="platform" wide>{(readOnly) => <SettingsWorkspace readOnly={readOnly} />}</BtbFeatureGate>;
}
...
{!readOnly && <SettingsForm ... />}
```

Running the matrix directly produces the contradiction in one table:

| Role | Can open Settings? (`view`) | Form rendered? (`edit`) | May save? (SQL) |
| --- | --- | --- | --- |
| staff | yes | **yes** | no |
| supervisor | yes | **yes** | no |
| manager | yes | **yes** | no |
| designer | yes | no | no |
| corporate | yes | **no** | **yes** |
| owner | yes | **no** | **yes** |

**Every role is excluded by one layer or the other.** Staff, supervisor and manager are shown
a form they cannot submit. Corporate and owner are the only roles that can submit settings, and
they are shown no form. There is no role for which the screen works.

### 1.3 This is not theoretical

The demo data has one confirmed location, The Grill House, version 3, with a report time,
compliance types and reminder days set. That row was **not created through this screen**. It
was created by calling the settings endpoint directly during demo seeding, which bypasses the
`readOnly` computation and reaches the SQL function that permits `owner`.

That is precisely why it looked finished. The endpoint works; the screen cannot reach it.
A user on the demo day who opens Location settings to change a recipient will find every
field greyed out, and there is no error message explaining why, because no request is sent.

### 1.4 The fix (small, and it belongs with the platform work)

The platform is one feature with several modules of different sensitivity; a single
`edit` group cannot describe it. Either:

- **Preferred:** give each platform module its own capability in the matrix
  (`platform.settings: corporate|owner`, `platform.operations: staff|supervisor|manager`,
  `platform.inventory: manager|owner`, ...) and have `BtbFeatureGate`/panels read the module
  they are rendering, mirroring the SQL `CASE` in `btb_platform_assert` one-for-one; or
- **Minimum:** switch the settings page's gate to the feature the SQL already checks
  (`btbCanEdit("vault", role)` is also corporate|owner, but semantically wrong) — do not
  add a second special case, fix the matrix to match SQL.

Whichever is chosen, add a test that walks every role against every platform write endpoint
and asserts *UI-allowed* equals *SQL-allowed*. The current suite has no such table, which is
why both mismatches (settings and inventory) survived a green run.
The inventory one is described in §2.2.

---

## 2. Marketing: permission mismatches, and two identities for one person

Marketing is the workflow with the most moving parts (request → corporate approval →
designer artwork → delivery). The **approval guard itself is correct and worth showing**.
Two things around it are not: the buttons and the database disagree about who may do what, and
one person is represented by two different primary keys depending on where you look.

### 2.1 What is correct

`src/lib/btb-platform-marketing.ts` offers actions strictly from state and role, and the SQL
refuses what the UI omits:

- a promotion cannot be approved by the person who created it;
  `schema-btb-platform-marketing.sql` raises
  `A different corporate approver must review your request`;
- approval is `corporate`/`owner` only (`marketing.approve`);
- design work (assign/start/upload/complete) is unreachable until `approved_at` is set;
- a designer may claim only their own work, and only if assigned to nobody else.

That is a real workflow guard, not a dashboard with a disabled button. Keep it.

### 2.2 Where the buttons and the database disagree

These matter because a client will click the button, see a refusal, and conclude the product
is broken even though the refusal is the correct behaviour.

**Settings** — covered in §1. Form shown to staff/supervisor/manager; SQL permits only
corporate/owner; corporate/owner are shown no form.

**Inventory** — `InventoryPanel` accepts no `readOnly` prop (zero occurrences), so its
count/purchase/finalize controls are rendered for anyone who can open the tab. The tab is
shown to `manager`, `corporate`, `owner` (`PLATFORM_MODULES.inventory`). But the SQL gate for
every write is:

```sql
actor:=btb_platform_assert(p_actor,p_session,p_location,'inventory.write');
-- 'inventory.write' THEN actor.role IN ('manager','owner')
```

So **`corporate` sees a full set of write controls that SQL rejects on every submit.**
They can read the ledger, as intended; the buttons around them are decoration.

**Marketing** — the tab is offered to `manager`, `designer`, `corporate`, `owner`, and the
panel correctly hides impossible actions (`marketingActions`). That part is right. The
identity problem is separate, and is §2.3.

### 2.3 Two identities for one person

`marketing_promotions.user_id` and `social_media_calendar.user_id` are **NOT NULL foreign keys
to `profiles(id)`**, with `ON DELETE CASCADE`. Every other record on the platform credits a
person through `btb_employees(id)`: `btb_created_by`, `assigned_to`, `approved_by`, the audit
log actor.

Those are two different tables. `btb_employees` is the personal staff account (the thing you
log into). `profiles` is the legacy FoodSafe account. Measured against production:
**0 of the 6 `btb_employees` rows share an id with any of the 9 `profiles` rows.** A designer
is not a `profiles` row; they are a `btb_employees` row with `role='designer'`.

The route cannot satisfy that key, so it does not try. `src/app/api/btb/platform/marketing/route.ts`
lines 38 and 43:

```ts
const profile = await requireBtbUploader(db);
...
p_profile: profile,
```

Every marketing row is attributed to a single shared service profile, while the real person
is recorded separately in `btb_created_by` / `assigned_to`. **The visible result is correct
today** — promotions list the right designer, approvals record the right approver, the SQL
guard uses the real id. Only the `user_id` column is a placeholder. Nothing a client sees is
wrong.

That is exactly why it is worth fixing now rather than after launch. The FK is declared
`ON DELETE CASCADE`: deleting the shared uploader profile would silently delete **every**
promotion and calendar post, under a correct-looking UI. And the moment anything reintroduces
a join as `marketing_promotions → profiles` for a name or a role, the designer column goes
blank for every row overnight, with no error and nothing in the audit log.

**Fix:** point both FKs at `btb_employees(id)`, drop the shared-profile indirection from the
route (pass the actor id directly, as every other platform table already does), and keep
`btb_created_by` as the audit column. One identity table, one source of truth.

---

## 3. Verification gates at `ce75753`

These were run against the exact commit named at the top, not a remembered figure.

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | **exit 0**, no diagnostics |
| Unit / database suite (Node 22) | `node --test .test-dist/tests/*.test.js tests/*.test.mjs` | **384 tests, 383 pass, 0 fail, 1 skipped** |
| PDF end-to-end | same, `REPORT_PDF_E2E=1 --conditions=react-server` | **350 tests, 350 pass, 0 fail** |
| Working tree | `git status --short` | clean except three untracked items (`reference-documents/`, `scripts/_tmp-migrate.mjs`, `.claude/`) |

The one skip is the daily-PDF test itself, which is skipped unless `REPORT_PDF_E2E=1` is set;
it is the 350-test run above that executes it. So the suite is fully exercised, not 383 of 384.

**A note on the number "9 failures".** On the default Node 20 binary the suite reports 9
failures outright. All nine are `WebSocketFactory.getWebSocketConstructor`,
`Node.js detected but native WebSocket not found`, from `@supabase/realtime-js` — an environment
message, not a product failure. Node 22 has a native `WebSocket` and the same tree passes
383/384. The project's own `package.json` engine range should say `>=22`; today it does not say so.

### 3.1 Reference files — reconciliation

All five client source files were supplied and every one was inspected. None is missing.

| File | Size | SHA-256 (first 12) | Inspected | Extracted | Import support in app |
| --- | --- | --- | --- | --- | --- |
| `GFS-Invoice-9041952706.pdf` | 52,023 | `8f542f238a7e` | yes | yes, text layer, both pages, 13 line items | **no** — manual re-entry only |
| `Master Inventory-October 1.numbers` | 899,434 | `2e834778813c` | yes | yes, via `numbers-parser`, 169 item rows | **no** — manual re-entry only |
| `PHOTO-2026-11-01-17-25-44.jpg` | 357,047 | `008264595d7b` | yes | yes, macOS Vision OCR | **no** — no image import |
| `TEMP CHECK SHEET.pdf` | 32,272 | `21ae5e0979b2` | yes | yes, text layer, 5 freezers + 3 coolers | **no** — no PDF form import |
| `drumheller sales July 2026.pdf` | 205,556 | `d4fe97587cf0` | yes | yes, text layer, 6 pages, figures read | n/a — reference only |

**Import is a real gap, and it is by design today, not by accident.** The import screen
(`InventoryPanel.tsx:261`) posts `extractor: "manual-upload"` and
`error: "No document extraction provider is configured. Read the source document and enter
its reviewed values here."` No OCR, PDF-parsing or spreadsheet library is wired into
`src/`; `pdfjs-dist` is installed but referenced nowhere in the application source. Every
figure from every reference file must currently be typed in by a person and confirmed by
eye. That is honest—the screen says so—but it is not what "upload your invoice" implies, and
the client should hear it in those words rather than discover it on camera.

### 3.2 One discrepancy found while reconciling the GFS invoice

The invoice was reconciled line by line rather than accepted. Header, customer number, 13
lines, and vendor all agree. The arithmetic does not:

- the 13 printed line totals sum to **831.33**;
- the invoice states **863.12**;
- the gap is **31.79**, about **3.824 %** of 831.33.

There is no tax, freight, subtotal or surcharge line anywhere in the two-page PDF to account
for the 31.79. It is stated honestly here as unreconciled: the line totals do not add up to
the stated total, and the document does not explain why. Before any invoice figure is used as
a trusted COGS input, the client should confirm which number is authoritative, or ask GFS for
the missing line. The application does not currently reconcile invoice totals at all, so it cannot catch this for them either.

### 3.3 The seeded DEMO month is not built from that invoice

Worth stating plainly, because the numbers differ and someone will notice:

| | Client's real GFS invoice | Seeded DEMO purchase |
| --- | --- | --- |
| Reference | `9041952706` | `INV-9041952706` |
| Stated total | **863.12** | **1,310.40** |
| Sum of its line items | 831.33 | 1,308.60 |
| Gap | 31.79 | 1.80 |

The DEMO month uses a three-line stand-in (1,310.40) to make a round food-cost number, plus
a Costco receipt of 189.87, giving purchases of 1,500.27. It is internally consistent and
auditable, but **it is not the client's invoice**, and the 41.61% in §5 follows from the demo
figures, not from 863.12. Even the demo purchase has a small unexplained gap of 1.80 between
its lines and its amount — the same class of defect as §3.2, at a smaller size.

The real invoice has not been loaded into the ledger. Doing so needs the answer to §6 item 4
(which total is authoritative) and, ideally, the missing GFS line that explains 31.79. Until
then the honest statement is: *the arithmetic engine is proven on demo inputs; the client's
own month has not been run through it.*

---

## 4. Requirement-by-requirement status

Status words used below, and nothing else:

- **COMPLETE AND VERIFIED** — built, and I exercised the end-to-end result myself.
- **IMPLEMENTED BUT NOT VERIFIED** — the code and schema exist and are consistent; I did
  not reproduce the full workflow with a real user, so it is a claim, not a fact.
- **PARTIALLY IMPLEMENTED** — some of the requirement works, some does not.
- **NOT IMPLEMENTED** — absent, or present but unreachable by anyone who needs it.
- **BLOCKED BY CLIENT INPUT** — cannot be finished until BTB answers a specific question.
- **BLOCKED BY CREDENTIALS** — code is complete; a key or secret is missing.
- **BLOCKED BY MISSING REFERENCE FILE** — the source document was not supplied.

No requirement is complete merely because a table, route or page exists.

| # | Requirement | Status | Evidence / what is actually missing |
| --- | --- | --- | --- |
| 1 | Five reference documents supplied and readable | COMPLETE AND VERIFIED | All five present, sizes > 0, SHA-256 recorded in §3.1; all PDFs have a text layer (not scans); JPEG OCR'd. |
| 2 | GFS invoice read into structured values | COMPLETE AND VERIFIED | Invoice `9041952706`, customer `722719440`, 13 lines, total `863.12`, GST 5%. Line-sum in §3.2 does **not** reconcile — flagged to client, not hidden. |
| 3 | Master inventory read into structured values | COMPLETE AND VERIFIED | 263 rows, 169 real items; Dry 90 / Cooler 34 / Freezer 29 / Special 10 / Unassigned 5. Duplicate `1330551` and 6 text-price rows found. |
| 4 | Sales report read into structured values | COMPLETE AND VERIFIED | `BTB Drumheller`, 2026-07-01 05:00 → 2026-08-01 04:59:59; Net Sales 61,108.19; Total Net Sales 61,400.23; Gross 64,756.94; GST 3,070.36; 1,641 orders. |
| 5 | Temperature-check form read | COMPLETE AND VERIFIED | 5 freezers, 3 coolers, LINE COOLER, CHEF BASE DRAWER, `SANTIZER` row, columns 11:00 AM / 4:00 PM / 8:00 PM, `TEMP CHECK` / `DATE`. |
| 6 | **Import those files into the platform by uploading** | NOT IMPLEMENTED | `InventoryPanel.tsx:261` hardcodes `extractor: "manual-upload"` and "No document extraction provider is configured." No OCR/parser is wired to `src/`. Values must be typed by hand. |
| 7 | Master inventory ingest contract (correct columns, duplicate handling) | PARTIALLY IMPLEMENTED | Column semantics established (`PKT` = case ÷ pack; `Packet Price` = qty × PKT; `Case Amount` always 0 and unused; `Par Value` and `QTY Case` empty). Contract is **specified, not built**; duplicate `1330551` must quarantine. |
| 8 | Inventory & food-cost period close | IMPLEMENTED BUT NOT VERIFIED | One month finalized: **food cost 41.61%** = (2,480.00 + 1,500.27 − 547.35) ÷ 8,250.00. Arithmetic checks exactly. Must be labelled DEMO: its GFS input is 1,310.40, not the client's 863.12 invoice (§3.3). So the *formula* is verified, the client's *month* is not. |
| 9 | Sales basis stored and locked with the month | IMPLEMENTED BUT NOT VERIFIED | `sales_basis = "Summary Total Net Sales"`, `sales_confirmed = true` on 2026-11. Basis is preserved per month, so a later default change cannot rewrite history. Needs client sign-off (§6). |
| 10 | Drafts never counted as zero (missing ≠ 0) | COMPLETE AND VERIFIED | `finalize` refuses unless all items have a non-null `line_value`; unfinalised food cost is rendered blank, and the overview prints "deliberately blank, never shown as zero". |
| 11 | Location settings confirmed and saveable | **NOT IMPLEMENTED** | §1: SQL allows only corporate/owner, the form is rendered only for staff/supervisor/manager. No role can save. One row is confirmed only because the demo seeder called the endpoint directly. |
| 12 | Daily emailed report (enqueue + send + resend) | BLOCKED BY CREDENTIALS | Enqueue requires `reports_enabled AND settings_confirmed`; both cron routes return 503 without `CRON_SECRET`; `RESEND_API_KEY` and `BTB_EMAIL_FROM` absent. Cannot send a single email, so cannot claim it works. |
| 13 | Compliance expiry reminders (60/30 day) | BLOCKED BY CLIENT INPUT + CREDENTIALS | Logic exists (`reminder_days`, `expiry:` dedupe, staff + manager recipients). No compliance types configured, no certificates uploaded, no email credentials — the loop has nothing to iterate. |
| 14 | Marketing request → approval → design → upload | IMPLEMENTED BUT NOT VERIFIED | Approval guard is real (different corporate approver, `approved_at` required before design). Two DEMO promotions exist, one `completed`, one `pending_approval`. I did not drive it through the browser as each role. |
| 15 | Designer can never self-approve or reach unapproved work | COMPLETE AND VERIFIED | `nextStep`/`marketingActions` plus the SQL `CASE`: `marketing.approve` is corporate/owner only; creator check refuses self-approval; read model filters artwork by `approved_at` for designers. |
| 16 | Marketing rows attributed to the right person | PARTIALLY IMPLEMENTED | `user_id` → `profiles(id)` (legacy), person → `btb_employees(id)`. **0 ids shared**. Every row currently points at one shared uploader profile (§2.3), so the FK is a liability, not a record. |
| 17 | Corporate overview (HQ roll-up) | IMPLEMENTED BUT NOT VERIFIED | Returns 4 locations with per-site counters; food cost intentionally blank when unfinalised. Loaded data, not measured the rendered page at this commit. |
| 18 | Role/location isolation enforced server-side | COMPLETE AND VERIFIED | `btb_platform_actor` + `btb_platform_assert`: role capability, active-location check, `btb_location_access` membership. All 18 platform functions `anon_exec=false`; every `btb_*` table refuses `anon`. |
| 19 | Audit trail on writes | COMPLETE AND VERIFIED | 45 `btb_events` rows; each mutation calls `btb_event(...)` with before/after and actor. Inventory reopens/finalises log actor + reason. |
| 20 | Legacy surfaces protected from the public key | NOT IMPLEMENTED (CRITICAL, §0) | 33 tables readable and writable by `anon`; hardening script exists but is outside the migration chain; step 27 re-opens the permission matrix. |
| 21 | Comprehensive test suite | COMPLETE AND VERIFIED | 384 tests, 383 pass, 0 fail, 1 gated skip; PDF E2E 350/350; typecheck clean. `tests/server-db-clients.test.ts` asserts that no BTB API route imports the shared anon browser client and that the browser bundle never contains the service-role key. |
| 22 | Tests that assert the *negative* (anon cannot read/write legacy data) | NOT IMPLEMENTED | The suite is green with the §0 hole open. No test performs an anon-role read or write against legacy tables. This is the gap that let it survive. |
| 23 | 3 vs 4/5 coolers; approved Celsius/PPM limits; per-location timezones; report times; recipients; compliance types | BLOCKED BY CLIENT INPUT | Form shows 3 cooler slots; other sources say 4–5. No limits are printed on the sheet. All 4 locations share `America/Edmonton`; recipients/reminder days/compliance types are empty. See §6. |
| 24 | Printed daily sheet (paper + one-month history) | IMPLEMENTED BUT NOT VERIFIED | `ce75753` adds `src/app/api/btb/temperatures/sheet/`; screen exists. Print output not measured against client's printer or paper stock. |

---

## 5. Demo walkthrough — click by click, for a non-technical owner

Ten minutes. Do it once, alone, before the client arrives. Anything marked **TEST DATA** is
our seeded demo material, not the client's real history; say so out loud when they see it.

### Before you start (once, 3 minutes)

1. Open a browser and go to `https://foodsafety-sigma.vercel.app/between-the-buns/login`.
2. Sign in with the owner email and the password from your protected credentials file.
   Do not read the password aloud, and do not type it on a shared screen.
3. Leave a second tab open on `/between-the-buns/platform`. You will return to it constantly.
4. Close every other tab, notification and chat window. The client notices banners.

**If sign-in fails:** the screen shows an inline error, not a blank page. Do not retry more
than twice; the login has a rate limit by design. Check the credentials file, or use the
manager demo account. Do not debug in front of the client.

### 0:00 — the hub (45 seconds)

1. Land on `/between-the-buns`. It renders the card grid and a daily strip.
2. Say: **"One sign-in, and every role gets a different workspace. Nothing here is a mock-up;
   these cards are the pages your team would actually use."**
3. Point at the **Location workspace** card. Do not open a legacy card yet.

### 0:45 — daily operations (90 seconds)

4. Click **Location workspace**. It opens `Daily operations` on today's date.
5. Use the location picker at the top. Switch to **The Grill House**.
6. Show the checklist section: opening, closing and cleaning duties. If a duty has not been
   done, the row is empty, and the empty row is honest; a green row is a timestamped record.
7. Say: **"Staff only tick what they complete. The server records who and when; the screen
   cannot pretend it was done."**
8. Switch the picker to **Ancoats**. The page reloads into an honest empty state, with the
   amber "not fully configured" banner.
9. Say: **"Ancoats is empty because Ancoats has not been set up yet. We do not seed fake
   history into a live site. Nothing here bleeds from one location into another."** That
   banner is a feature; let them see it.

### 2:00 — temperatures

10. Open **Temperature log** from the hub.
11. If the Grill House sheet is on screen, show the columns: 11:00, 4:00, 8:00. Say:
    **"The server timestamps the reading and compares it to the approved range. It does not
    ask the person to type the range."**
12. Enter **one real reading** now, if they want to see it work: pick the current slot, type a
    plausible fridge temperature, save. Then refresh the page. The reading is still there.
    That round trip is the whole point: **saved means saved**. This writes a genuine record to
    the live site, so do it only with their nod, and delete it afterwards.
13. If no reading is convenient, skip to the sheet and say: **"Readings are blank today
    because nobody has taken them yet. Blank is not zero, and we never fill it in for you."**
14. Do **not** demo the print button against their printer unless §6 print specifications are
    confirmed.

### 4:00 — inventory and food cost (2 minutes)

15. Return to `/between-the-buns/platform`, choose **Inventory & food cost**, location
    **The Grill House**, month **November 2026**.
16. Say, before they ask: **"This month is TEST DATA, seeded in the approved demo session so the
    maths could be proven end to end. Your real October sheet is the one we converted. Note the
    GFS line here is a demo stand-in at 1,310.40, not your actual invoice."**
17. Walk the four numbers, slowly, in this order:
    - opening value `2,480.00` (DEMO baseline stocktake)
    - purchases `1,500.27` = demo GFS invoice `1,310.40` + demo Costco receipt `189.87`
    - closing value `547.35` (DEMO counts on 3 items)
    - net sales `8,250.00` (DEMO)
    - closing value `547.35`
    - net sales `8,250.00`
18. Say the formula out loud: **"(opening plus purchases minus closing) divided by sales.
    2,480.00 plus 1,500.27 is 4,000.27. Minus 547.35 leaves 3,432.92. Divided by 8,250.00 is
    41.61 per cent."**
19. Say why it matters: **"That is your food cost for one month, computed from the same four
    numbers an accountant would use, and every change is logged with who made it."**
20. Open the audit list. There is a row per action. **"If a number is wrong, we can see who
    touched it, when, and what it was before."**
21. If they ask where their real month is: **"The October master inventory is converted and
    ready to load. Loading it needs one decision from you first (see §6, item 4); we do not guess."**

### 6:00 — marketing (90 seconds)

22. Switch to **Marketing**, still at The Grill House.
23. Show the completed promotion, *Double Smash Combo Week*. **TEST DATA.**
    **"Manager raised a request, corporate approved it, the designer produced the artwork,
    it came back for feedback, and it is complete. Five roles' worth of work in one card."**
24. Say the rule that matters: **"A designer cannot approve. The database refuses it, not
    just the button. And one person cannot approve their own request either; a second
    corporate account must sign off."**
25. Do **not** approve *Family Bundle February* on camera unless you have a second corporate
    account ready to hand. Otherwise stop at the pending card and say what would happen next.

### 7:30 — corporate overview (45 seconds)

26. Open `/between-the-buns/platform/overview`.
27. Say: **"This is the head-office view: every site on one line. A site manager sees one line,
    their own. That is enforced in the database, not hidden in the browser."**
28. Point at the blank food-cost cell for the three empty sites and say: **"Blank, not zero,
    because they have not been counted yet. A zero would be a lie."**

### 8:15 — settings: present it honestly (45 seconds)

29. Open `/between-the-buns/platform/settings`. The four locations and the team list render.
30. **Do not** try to save from the manager account in front of them: it will be refused (see §1).
   Instead say: **"This screen is where each site's timezone, report time and recipients will
   be set. The list is live; the save path is the next thing we fix, and it is small."**
31. If they ask to try it, let them click. A refusal is a correct, honest outcome; a silent
    success would be worse. Log what they clicked so the fix matches their expectation.

### 9:00 — close (60 seconds)

32. Say: **"What is live and proven: the operations record, the ledger and its arithmetic,
    the audit trail, role isolation, and the full test suite. What is not: the settings save
    path, the legacy tables' public write access, and emailing, which needs your mail
    provider credentials. I have listed all three."**
33. Offer the honest next step: **"Give me half a day and the settings and the public-write
    finding are gone. Email needs a key from your provider, which is a five-minute job on
    your side."**
34. Leave `CLIENT_ACCEPTANCE_WALKTHROUGH.md` with them. It is the same facts, in writing, with
    the tables they will want later.

### If something breaks mid-demo

- **A page is blank or spins:** open it directly by URL (the path is in this document); the
  page loads its own data server-side. If it still spins, move on; do not reload in a loop.
- **A save is refused:** say "that is the permission model refusing a change my role should
  not make", and move to the same action under the correct account. Do not "try again"
  repeatedly; there is no retry that will help, and it looks like a fault to the client.
- **The network drops:** the ledger already loaded stays on screen. Do not narrate the Wi-Fi.
  Refresh once when it returns.
- **You are asked a question you cannot answer:** "I do not know; I will confirm and send it
  in writing today." Then actually do.

---

## 6. Decisions only the client can make

Each of these is currently blocked on a written answer, not on our work. The app has a
placeholder or an empty field until then, and says so on screen.

1. **Cooler count.** The supplied temperature form shows **three** cooler rows; other material
   mentions four, and five. How many coolers per site, and do they have fixed names?
2. **Approved temperature limits.** The form prints the columns but **no limits**. What is the
   approved Celsius range for each fridge, freezer, cooler and the chef-base drawer? Which
   document authorises those figures (we need it on file, not just a number)?
3. **Sanitizer standard.** The form has one row spelled `SANTIZER`, with no chemical or unit.
   Is it Quat, chlorine, or both? What is the approved ppm band, and is that per sink or per
   bottle? (Our demo uses Quat 200-400 ppm; the client must confirm or replace it.)
4. **Sales basis sign-off.** We store `Summary Total Net Sales` (61,108.19 for Drumheller,
   July). The report also contains Total Net Sales 61,400.23 and Total Gross 64,756.94.
   Food cost percentage is only meaningful against one of these. Confirm which, in writing;
   the figure is locked per month and changing the default later cannot rewrite history,
   which is why we will not guess.
5. **Timezones.** All four sites are currently `America/Edmonton`. Is that correct for
   every site, or should each be set individually?
6. **Report time and recipients.** What local time should the daily report go out, and to
   which addresses (manager / owner / additional / compliance)? These empty lists are what
   block email.
7. **Compliance types and reminder days.** We have Food Handler, First Aid, WHMIS as
   examples. Which types apply, and is 60/30 days the right warning window, or 90/60/30?
8. **Print specifications.** For the printed temperature sheet: paper size (Letter or A4),
   and whether one page per day or one page per month.
9. **Invoice reconciliation.** GFS `9041952706` states 863.12 but its 13 line totals add to
   831.33 (see §3.2; gap 31.79). Which figure is authoritative for food-cost, and should
   the app block an invoice whose lines do not add to its stated total?

Until each answer arrives, the corresponding field is visibly empty rather than filled with
a plausible guess. That is deliberate.

---

## 7. Honesty notes — how to read this document

- **"Verified"** means I ran it against `ce75753` and observed the result. It does not mean
  "the code looks right".
- **"Implemented but not verified"** is used where the SQL and the UI exist and agree, but I
  did not drive the whole workflow in a browser as every role. It is a claim with a named gap,
  not a pass.
- **The DEMO data is not the client's.** It was seeded in the approved demo-data session
  documented in `CLIENT_DEMO_GUIDE.md` §8, **not by this audit**, which wrote nothing. It
  covers two promotions, three equipment items with kitchen limits, one finalized November
  month, a demo manager and a demo designer. All are labelled `DEMO —` and all are removable
  (see that guide's §8.4). No client business record was invented to make a screen look busy.
- **The money in §5 is arithmetic on demo inputs, not a claim about the client's real margins.**
  41.61% proves the formula and the audit trail; it says nothing about whether the restaurant is
  profitable.
- **No email was sent.** There is no provider credential on this machine; that is why
  requirement 12 is *blocked*, not *failed*.
- **The security finding was not exploited.** Reads were performed only to count rows; the
  write tests used a filter that matches nothing and changed no data (before/after counts
  in §0.2 are identical). I did not open, copy or decrypt any credential.
- **No secrets appear here.** Passwords are described as "in your protected credentials
  file"; keys are described by name, never by value. If you paste this document into a ticket
  or a chat, nothing in it needs redacting.
- **The repository is public.** Before this document is committed, that decision should be
  reviewed by whoever owns the repository, because every future commit is readable by
  strangers. This is recommendation 0, ahead of the code fixes.

---

## 8. What I would do next, in order

1. **Tonight, 20 minutes:** rotate the anon key; run `deploy/04-security-hardening.sql`;
   re-check §0.7. This removes the live exposure even before any code changes.
2. **Half a day:** unify the permission matrix (§1.4) so *UI-allowed = SQL-allowed* for every
   role and module, add the per-role table test, and fix migration step 27 so it cannot
   re-open the permission matrix. This closes §1, §2.2 and most of §0's
   recurrence.
3. **Same half day:** move `marketing_promotions.user_id` / `social_media_calendar.user_id`
   to `btb_employees(id)` (§2.3). One identity table.
4. **Under an hour, once the key arrives:** set `RESEND_API_KEY`, `BTB_EMAIL_FROM`,
   `CRON_SECRET`, confirm one location's settings through the (now working) screen, and send
   one real report to yourself. Only then mark email **verified**.
5. **Before any real month is closed:** collect §6 answers 1–4, 6 and 9. Food cost on a
   guessed sales basis is worse than no food cost, because it looks authoritative.
6. **Optional, only if the client asks for uploads:** build the document extractor (text
   layer PDF, then OCR, then spreadsheet) with a mandatory human confirmation step. Today
   "import" means "type"; do not present it otherwise.

None of the above required a rewrite. The access model, the ledger arithmetic, the audit
trail and the approval workflow are sound; the work is in aligning the interface with them
and in closing a hole that predates the platform.
