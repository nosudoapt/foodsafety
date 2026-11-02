# Finish BTB setup using the dashboards

Use **Supabase SQL Editor** and the **Vercel dashboard**. The SQL Editor route
uses your signed-in Supabase account, so the failed database-password connection
does not prevent this installation.

## Information to provide

1. The **Vercel project name and production URL** (for example, your `.vercel.app`
   address or custom domain), plus its linked GitHub repository/production branch.
   This checkout uses **`nosudoapt/foodsafety`**, branch **`main`**; confirm the
   Vercel project's linkage matches.
2. The result of the SQL steps below: the verification result grid, or the exact
   error message if a transaction fails.
3. Confirmation that the listed Vercel environment variables are configured.
4. When ready, a **Resend-verified sender address**, real **manager and corporate
   recipient addresses**, and confirmation from those inboxes after a test send.

Put secret values in Vercel or the ignored local `.env.local` file. The project
name, app URL, uploader UUID and SQL verification results can be shared directly.

## 1. Configure Vercel

Open the project → **Settings → Environment Variables**. Configure **Production**
with these values (use separate development/test values for other environments):

| Variable | Value / source |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL; already in `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing browser anon key; already in `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server service-role key; already in `.env.local` |
| `BTB_UPLOADER_PROFILE_ID` | `67472997-c69a-460d-b171-2a527df8ff5c` — provisioned for the connected Supabase project and saved in `.env.local` |
| `BTB_PASSWORD` | A strong shared-workspace password chosen by you |
| `BTB_SESSION_TOKEN` | A separate random signing secret; generate at least 32 random bytes with a password manager |
| `CRON_SECRET` | Another independent random secret, at least 32 random bytes |
| `RESEND_API_KEY` | Resend → API Keys; a sending key for your verified domain |
| `BTB_EMAIL_FROM` | Your verified sender, e.g. `Between the Buns <renewals@your-domain.ca>` |

`SUPABASE_URL` is an optional server alias for the same Supabase URL. The existing
`VAULT_ENC_KEY` must also stay configured if the login vault is used.

Choose **Node.js 22.x** in the project's build/runtime settings. For the
`nosudoapt/foodsafety` repository, `package.json` is at the repository root, so
leave **Root Directory** at its default. The framework is **Next.js** and the
build command is **`npm run build`**.

The dedicated uploader has already been provisioned in the connected Supabase
project and verified again successfully. Its real Auth user/profile owns document
and marketing foreign keys; its FoodSafe role is `staff` and interactive sign-in
is disabled. The actual BTB employee/shared-workspace creator is stored separately
on each new record.

## 2. Install SQL and deploy this source revision

Coordinate these steps as one release: the SQL changes table permissions, and
the matching application accesses those tables through its server routes.

With the Vercel settings configured, commit and push the release through your normal Git workflow
(GitHub Desktop also works), then deploy that source revision through the linked
Vercel project. Confirm the deployment is **Ready** and assigned to the production
URL. Environment-variable edits take effect in a new deployment.

Then complete the database installation immediately. In the target Supabase
project → **SQL Editor → New query**, paste and run each complete file in this order:

1. [`supabase/schema-btb-team-operations.sql`](../supabase/schema-btb-team-operations.sql)
2. [`supabase/schema-btb-uploads.sql`](../supabase/schema-btb-uploads.sql)
3. [`deploy/05-btb-release-check.sql`](05-btb-release-check.sql) — read-only verification

Keep the `BEGIN` and `COMMIT` in the first two files. A successful installation
should make all **39 verification rows PASS**. Send the result grid back. If a
transaction fails, send its error before proceeding so the missing prerequisite
can be addressed.

This established production project uses direct SQL Editor releases. Follow
this order rather than the historical full migration/seed sequence in the
general database setup guide.

The existing inventory hardening release has its own health check and SQL order
in [`deploy/README.md`](README.md).

## 3. Confirm BTB access and uploads

1. Open `<production-url>/between-the-buns/login`.
2. Sign in as `manager@foodsafe.demo` with your configured `BTB_PASSWORD`.
3. Open **Employees** and create the manager's personal account. Sign in with it.
4. Open **Business documents**, upload a small PDF, refresh and download it.
   Confirm **Added by** shows the manager's name.
5. Open **Marketing**, save a campaign and a dated social post, then refresh.
6. Confirm these URLs return JSON successfully in the signed-in browser:
   `/api/btb/employees`, `/api/btb/documents`, `/api/btb/marketing`,
   `/api/btb/licence-reminders`. The document/marketing response should include
   `uploader.connected: true`.

Document/artwork uploads have a **3 MB** limit so their base64 request fits
Vercel's function request limit. Campaign artwork is optional. If setup is
incomplete, the pages explain the uploader connection and provide a retry.

## 4. Configure and verify real email

When the sender and recipient addresses are ready:

1. In Resend, add your sending domain and install its requested DNS records.
   Wait for **Verified**, then configure `RESEND_API_KEY` and `BTB_EMAIL_FROM`
   in Vercel and deploy with those settings.
2. As manager or corporate, open **Licence Email Reminders**. Enter real addresses
   in both recipient groups, choose reminder windows, enable reminders and save.
3. Confirm at least one actual business licence or staff certificate is due within
   a configured window. Use **Send due reminders now** to dispatch eligible due
   records. Capture the resulting
   history entries and their provider message IDs.
4. In Resend, check those IDs for **Delivered** or a concrete delivery failure.
   Ask both recipient groups to confirm arrival, including their spam/junk folders.
   Record the subject/time and receipt confirmation. App **Sent** means Resend
   accepted the message; inbox confirmation completes the live test.
5. In Vercel's **Cron Jobs** view, confirm the deployed schedule from `vercel.json`:
   `/api/cron/btb-licence-reminders` at **`0 15 * * *`**. Vercel supplies the
   `CRON_SECRET` bearer header. Check the next recorded **Last run** in BTB.

The schedule targets **15:00 UTC / 09:00 America/Regina** daily; actual start
precision depends on the Vercel plan. If there are no due records, a run sends
zero messages. Reminder history deduplicates already-sent document/window/recipient
combinations; use the original provider ID when checking a previous test.

## Current status

- Uploader implementation and the real dedicated Supabase profile are verified;
  rerunning the provisioning script reused the same identity.
- Lint, TypeScript, 342 unit/database checks, 79 Chromium tests and the normal
  production build passed. The SQL verifier passed its local installed-schema,
  missing-object and injected-failure checks.
- Production migration/deployment and real inbox delivery need the dashboard
  steps and details above.
- Local automated verification is recorded in [`NEXT_SESSION.md`](../NEXT_SESSION.md).

The detailed operational runbook is [`BTB_TEAM_SETUP.md`](BTB_TEAM_SETUP.md).
