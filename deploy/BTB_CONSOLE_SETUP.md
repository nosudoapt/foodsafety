# Between the Buns — super-admin console setup

The BTB team workspace lives at `/btb/demo` (sign-in `/btb/login`). The group
console is separate: `/btb/admin`, with its own credentials in `btb_super_admins`
and its own `btb_admin_session` cookie. No shared demo account or employee
password unlocks it.

> The console returns **503** until migrations 32–35 are applied. That is the
> tolerant lookup in `btb-admin-auth.ts`, not a broken deployment.

## 1. Apply the console schema

Apply the steps registered in `supabase/migrations.json` (32–35), in order:

| Step | File |
|---|---|
| 32 | `schema-btb-superadmin.sql` |
| 33 | `schema-btb-invitations.sql` |
| 34 | `fix-btb-page-capabilities.sql` (if not already applied) |
| 35 | `schema-btb-admin-monitoring.sql` |

With a configured `SUPABASE_DB_URL`/service connection, `npm run db:migrate`
applies them and records each step. **These files are written but not applied by
the repository**; the console cannot work until they run in the target database.
Step 35 also replaces `btb_platform_file_put` with the atomic per-location
storage cap and adds index `btb_activity_location_window`.

## 2. Create the first console administrator

```bash
node scripts/bootstrap-btb-admin.mjs
```

The script prompts for an email and a password (minimum 10 characters), shows
the exact insert plan, and requires confirmation. It writes one
`btb_super_admins` row with a scrypt password hash and touches nothing else.
Re-running it for an existing email is refused rather than overwriting.

After signing in, rotate the console password from the **Console account**
panel on `/btb/admin`: it requires the current password, stores a new scrypt
hash and bumps `session_version`, which signs out every other console session
while keeping the current tab signed in.

## 3. Sign in and create locations

1. Open `/btb/admin/login` and use the console email/password.
2. **Locations → Add location.** Creating a location adopts it into
   `btb_superadmin_locations`, which is the only set the console and its
   monitoring can see. Close a site without deleting its history.
3. Open a location to add people.

## 4. Invite people

The Add-person form takes a name, email, role (`staff`, `supervisor`, `manager`)
and a page-access checklist for that location. It creates:

- a `btb_employees` row with `login_enabled = false` (shown as **Invited**),
- a `btb_location_access` membership and the `btb_location_page_access` grants,
- a single-use `btb_invitations` row (SHA-256 stored; raw token only in the email),
- a `btb_email_jobs` row of kind `invite`.

The person opens `/btb/login/set-password?token=…`, chooses a password (minimum
10) and lands on `/btb/demo` with **only** the granted pages. Grants are re-read
on every request, so changing the checklist takes effect on their next request;
password/role/deactivation changes bump `session_version` and require a fresh
sign-in. People may belong to several locations, and a page is allowed when any
of their locations grants it.

If `RESEND_API_KEY` or `BTB_EMAIL_FROM` is unset, the console returns the invite
link once so it can be copied and sent manually — it never silently succeeds.

### Email delivery depends on cron

`vercel.json` schedules:

- `/api/cron/btb-licence-reminders` — `0 15 * * *`
- `/api/cron/btb-daily-reports` — `0 14 * * *` (drains the shared
  `btb_email_jobs` outbox, including invitations)

Both need `CRON_SECRET`. Without the second schedule, invites stay **pending**
forever. The console shows that state.

## 5. Monitoring

`/btb/admin` summarises the managed group: locations and people, files and
storage against each site's 50 MB default cap, workspace visits (best-effort
attribution from `app_activity`), AI units, open shifts, open problems (failed
email jobs, document extraction errors, hours needing changes), today's checks
and readings, and a per-location health table fed by `btb_events`.

Per-location page-view attribution is best-effort: a BTB visit is attributed
only when the person belongs to exactly one location. `btb_events` is the
authoritative per-location signal for last activity, busiest hour and
most-used features. "Compute" is approximated by AI-call quota usage; there is
no infrastructure-level CPU metering.
