// One place to say whether the browser suite can actually authenticate.
//
// The unified sign-in resolves a credential through Supabase Auth (`auth.users`)
// and the workspace_* schema (migrations 57-59). The e2e PostgREST stand-in is a
// plain PostgreSQL assembled from the BTB schema files and has neither, so every
// authenticated spec would stop at its first sign-in call. They are skipped with
// this reason rather than deleted; `playwright test --list` still lists them.
// See e2e/README.md for the harness work that removes this gate.
export const authHarnessReady = process.env.E2E_AUTH_HARNESS === "1";
export const AUTH_HARNESS_REASON =
  "Blocked: the unified sign-in needs Supabase Auth (auth.users) + workspace_* in the e2e database; see e2e/README.md";
