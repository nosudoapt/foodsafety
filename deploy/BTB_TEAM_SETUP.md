# BTB team, operations and licence-email setup

This release adds individual employee logins, attributed daily checks, weekly
schedules, saved order history, manager-reviewed training, staff certificates,
licence emails and the franchise/loyalty guides.

For the user's **Vercel + Supabase SQL Editor** workflow, start with
[dashboard-only setup](BTB_DASHBOARD_SETUP.md).

## Current installation status

The implementation is exercised locally against PostgreSQL-compatible PGlite
and a loopback email-provider fixture. The new schema has **not been applied to
the connected Supabase project**: its configured database connection returned
`28P01 password authentication failed for user "postgres"`.

Real email delivery also needs `RESEND_API_KEY`, `BTB_EMAIL_FROM`, `CRON_SECRET`
and actual manager/corporate recipients. Test-provider acceptance does not
establish real inbox delivery. Verify the pushed revision's Vercel deployment before live checks.
Shared workspace credentials are maintained in server-only `src/lib/btb-auth.ts`;
individual credentials remain in the database. BTB needs no separate login
environment variables. The dedicated uploader Auth/profile was provisioned through the service-role API;
its UUID is saved as `BTB_UPLOADER_PROFILE_ID` in `.env.local`. The additional
`schema-btb-uploads.sql` migration is also pending live installation.
The final targeted Auth/profile reread and provisioning-script rerun succeeded,
confirming that the same identity is reused with interactive login disabled.

## 1. Runtime and environment

Use Node.js 22.13 or later (`.nvmrc` selects Node 22), with `foodsafety/` as the
application root. Copy the names in `.env.example` to the hosting environment.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing browser/client configuration |
| `SUPABASE_URL` | Optional server URL; falls back to the public URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged, server-only database access for BTB APIs |
| `BTB_UPLOADER_PROFILE_ID` | Real dedicated Supabase profile for BTB document/marketing creation |
| `RESEND_API_KEY` | Server-only Resend sending key |
| `BTB_EMAIL_FROM` | Resend-verified sender, e.g. `Between the Buns <renewals@your-domain.ca>` |
| `CRON_SECRET` | Random server-only secret for scheduled dispatch |

Secrets must not use a `NEXT_PUBLIC_*` name. BTB derives its private session-signing
key from the existing `SUPABASE_SERVICE_ROLE_KEY`; no additional signing setting
is needed. Rotating that backend key ends existing BTB sessions. Shared logins
use the backend-owned credentials in `src/lib/btb-auth.ts`. Individual passwords
are stored as salted scrypt hashes, independently of FoodSafe/Supabase Auth.

## 2. Install the team schema

Deploy this application revision and install
[`supabase/schema-btb-team-operations.sql`](../supabase/schema-btb-team-operations.sql)
in the same release. Use the target project's Supabase **SQL Editor** with the
complete file, including its transaction. A working database password is needed
only when connecting through a database client instead of SQL Editor.

The script expects the existing application schema, including:

| Existing tables | Source schema |
| --- | --- |
| `staff_members`, `staff_shifts` | `schema-staff-schedule.sql` |
| `btb_checklists` | `schema-checklists.sql` |
| `order_sheets` | `schema-features.sql`, with the existing `location_id` extension |
| `training_topics`, `training_sections` | `schema-training.sql` |
| `new_restaurant_tasks`, `compliance_documents` | `schema-compliance.sql`, with the existing compliance `location_id` extension |
| `staff_licenses` | `schema-rbac.sql` |
| `profiles`, `locations`, `role_page_access` | Existing base, locations and page-access schemas |

It creates 14 BTB tables and nine transactional functions, adds training module
revisions/video metadata, and refreshes the PostgREST schema cache. BTB tables,
functions and the training tables are available through the server's service
role; `anon` and `authenticated` access is revoked.

The script is re-runnable. It imports company-wide roster, schedule, checks and
order records, plus BTB certificates and existing franchise tasks. Original rows
and site-scoped source data are retained. Order snapshots and every saved
revision have no age-based purge. Existing custom launch tasks appear alongside
the complete required template. Imported checks without employee attribution
are explicitly labelled as legacy records.

This production project intentionally has no migration ledger. Follow the
existing [deployment runbook](README.md): do not run `npm run db:migrate*` or
create/populate `_migrations` against it.

After installation, sign in as a manager and confirm that these reads return
HTTP 200 rather than a schema/setup error:

- `/api/btb/employees`
- `/api/btb/staff-schedule?start=2026-11-02` (replace with the Monday being checked)
- `/api/btb/checklists`
- `/api/btb/orders`
- `/api/btb/training`
- `/api/btb/training/print` (manuals and training page access must both be enabled)
- `/api/btb/staff-licences`
- `/api/btb/licence-reminders`

Use a corporate workspace for `/api/btb/franchise-checklist`. The existing
inventory deployment/security checks remain documented in `deploy/README.md`.

After the team transaction, install
[`supabase/schema-btb-uploads.sql`](../supabase/schema-btb-uploads.sql) in the same
release. It adds separate employee attribution to the three existing upload
tables and removes their legacy anonymous access. FoodSafe retains authenticated
policies with a restrictive BTB restaurant boundary. Run the read-only
[`deploy/05-btb-release-check.sql`](05-btb-release-check.sql) and check every row
for **PASS**, then verify `/api/btb/documents` and `/api/btb/marketing` as manager.

FoodSafe manuals use `/api/manuals/training` with a separate, verified Supabase
management session. Confirm that its published shared/site training prints and
that a BTB-only session receives HTTP 401. Keep browser grants revoked on both
training tables; both applications now read this content through the server.

## 3. Set up individual accounts

1. Open `/between-the-buns/login`. Bootstrap through the existing shared manager
   address, `manager@foodsafe.demo`, using the backend workspace password (`admin1234`).
2. Open **Employees** and add the manager's personal record: name, unique email,
   phone, optional position, **Manager** role and an initial 10–128-character
   password. Save, then sign in using that individual email/password.
3. Add the remaining team. Give each employee their initial password directly;
   they can change it under **My account**. An imported record marked **Needs
   account setup** needs its contact fields and an initial password completed.
   Duplicate imported emails are left unassigned until corrected.
4. Managers manage staff, supervisors and managers. Supervisors manage staff
   accounts. Changing one's own role or deactivating oneself requires another
   manager. A forgotten personal password is reset through the employee record.

Personal sessions last 12 hours. Password resets and email, role or active-state
changes invalidate older sessions through the credential version. Account
status is verified again on protected requests. Shared workspaces remain
available for permitted management/viewing tasks; their saves are labelled
`Manager (shared workspace)`, for example.

Daily duty completion and personal training submissions require an individual
login. FoodSafe's login, recovery and sign-out remain independent of BTB.

## 4. Operational workflows

- **Weekly schedule:** managers/supervisors assign an employee, time and
  **Opening**, **Closing**, **Opening & closing** or **Service** responsibility.
  Select **Ends next day** for an overnight shift. Overlaps are rejected. Imported
  shifts start as Service; assign opening/closing responsibilities as needed.
  Coverage always shows the whole team, including in the manager view.
- **Daily checks:** each changed duty uses the signed-in employee's identity.
  Opening and closing device drafts are independent. Failed/conflicting saves
  retain the draft and provide a way to load the latest record before applying it.
- **Order sheets:** save a dated snapshot, compare previous quantities, reuse
  previous PAR values, browse older dates and open each saved revision. Archived
  items remain in their saved records.
- **Training:** managers publish modules. Employees save section progress and
  submit for review. Only a manager can approve or request changes; another
  manager must review a manager's own training. Approval is tied to the module
  revision, so editing a module requires renewed review. Manager, supervisor and
  corporate dashboards show team progress and approval state.
- **Certificates:** managers add a linked employee or a manually named staff
  member, certificate type, dates and notes. A PDF/JPEG/PNG/WebP attachment is
  optional, up to 5 MB. Downloads use the saved attachment; changing metadata
  preserves it unless a replacement is supplied.
- **Print:** daily opening + closing checks, a full weekly schedule and a saved
  order each have a one-page Letter layout. The schedule is landscape. All saved
  content is fitted to the page; screen filters and unsaved drafts do not remove
  rows from the printout. Disable browser headers/footers for the intended layout.
- **Franchise Opening Checklist:** the existing `/new-restaurant` card remains
  corporate-only, with all 16 sections and every required task. Additional and
  imported tasks retain their own saved progress.
- **Loyalty Rewards:** one card contains the employee and customer guides. Staff,
  supervisors and managers can open both. The employee guide includes the
  barcode-first sequence, reward/points flows and the approved $0.05 workaround.

Saved page restrictions still apply to both navigation and protected API access.
The administrator workspace is limited to access management.

## 5. Configure licence emails

1. Verify a sender/domain in Resend and configure `RESEND_API_KEY` and
   `BTB_EMAIL_FROM` on the application server.
2. As manager or corporate, open **Licence Email Reminders** at
   `/between-the-buns/licence-reminders`. Enter actual recipient addresses in
   **both** the manager and corporate groups (1–10 per group). Employee login
   emails and the shared demo role addresses do not populate these groups.
3. Set reminder windows, enable reminders and **Save reminder settings**. The
   defaults are **30, 7, 1 and 0 days**. Zero covers expiry day and overdue records.
   A missed run uses the nearest reached window instead of sending a backlog of
   every earlier window.
4. Use **Send due reminders now** to verify a due business licence/certificate.
   Delivery history records recipient, attempt count, provider ID and any error.
   “Sent” means accepted by Resend; confirm real inbox delivery/bounces there.
5. Configure `CRON_SECRET` and deploy `vercel.json`. It requests
   `/api/cron/btb-licence-reminders` daily at **15:00 UTC / 09:00 America/Regina**.
   Vercel sends `Authorization: Bearer <CRON_SECRET>`. The endpoint needs a Node
   runtime with a 300-second maximum duration.

For another host, arrange the same authenticated GET request from its scheduler:

```sh
curl --fail-with-body \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/btb-licence-reminders"
```

The **Scheduler secret configured** badge checks configuration presence. Confirm
the deployed schedule itself in the host and the next **Last run** timestamp.

### Dispatch and retry behaviour

- Sources are company-wide BTB `compliance_documents` (`location_id IS NULL`)
  and BTB staff certificates with expiry dates. Other restaurants, site-only
  business records and records without expiry dates are excluded.
- Addresses are normalized and deduplicated across both groups. One message is
  sent per document, expiry date, reminder window and recipient.
- A transactional five-minute lease prevents concurrent claims of the same job.
  Each retry uses the original job content and `btb-licence-<job-id>` provider
  idempotency key. Each job allows at most **three total claims**.
- Failed sends retry within a bounded batch. Manual runs claim up to 30 messages
  within a 45-second budget; cron runs claim up to 300 within 270 seconds. A
  remaining count can be handled by another run.
- Uncertain deliveries stop retrying after **23 hours**, before Resend's
  idempotency window ends. **Check provider** requires reviewing the original
  provider result. Retaining that history prevents accidental duplicate sends.
- Disabling reminders, removing a recipient or renewing/removing the source
  document prevents a new claim against the previous settings/expiry.

## Uploader integration

BTB document and marketing reads, downloads and mutations use the authorized
`/api/btb/documents`, `/api/btb/marketing` and `/api/btb/social-posts` endpoints.
Each request rechecks the BTB session, role and saved page access. Creation
resolves `BTB_UPLOADER_PROFILE_ID` against a real `profiles` row belonging to
`Between the Buns`. FoodSafe continues using its own Supabase identity.

`business_documents.user_id` / `uploaded_by`, `marketing_promotions.user_id`
and `social_media_calendar.user_id` remain profile foreign keys. The separate
`btb_created_by` employee FK and `btb_created_by_name` retain the verified actor;
shared sessions are labelled explicitly. Supplied browser identity/restaurant
fields cannot override the server values. BTB campaigns are company-wide.

Provision once per Supabase project using Node 22 and the existing server key:

```sh
node scripts/provision-btb-uploader.mjs
```

It creates/reuses the marked `btb-uploader@foodsafe.invalid` Auth identity, ensures
its BTB staff profile exists, disables interactive sign-in and prints only the
UUID setting to copy to local/Vercel configuration. It uses Auth APIs rather than
the database-password connection. The connected project's uploader is already
created; reruns verify the same marked profile.

The UI enables creation after a successful server connection check, retains
failed drafts and offers a connection retry. New document/artwork attachments
are limited to **3 MB** to fit Vercel's request limit after base64 encoding.
Promotions can be saved without artwork. Reads are fully paginated and return
file content only for a separately authorized download.

## Local verification

```sh
npm run lint
npx tsc --noEmit
npm test
npm run test:e2e
npm run build
git diff --check
```

The browser suite starts a production-mode app on `127.0.0.1:5101` and local
Auth/PostgREST/email fixtures on `127.0.0.1:5102`. Team operations execute the
actual SQL schema/RPCs in PGlite; the test server redirects Resend only to the
local provider fixture. PDF checks inspect actual Letter page counts, full text
and text coordinates. Results, screenshots, PDFs and traces are attached to
`playwright-report/` and `test-results/`.

Browser fixture builds embed loopback configuration. Run the normal
`npm run build` **last** to restore the application's regular environment.
