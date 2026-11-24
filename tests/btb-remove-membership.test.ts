import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Removing a person from a branch is a console action on someone else's row, and
// the last-membership case is self-referential (the removal creates the very
// state the guard checks). Both were broken by single-branch pins, so pin the
// fix at the SQL level.
const sql = (file: string) => readFileSync(join(__dirname, "..", "..", "supabase", file), "utf8");

test("the scoped-row guard lets a console act on any branch it administers", () => {
  const scope = sql("schema-btb-remove-membership.sql");
  assert.match(scope, /workspace_console_locations cm/, "the console estate exemption must be present");
  assert.match(scope, /cm\.console_id=\(context->>''credentialId''\)::uuid/, "scoped to this console");
  assert.match(scope, /cl\.tenant_id=\(context->>''tenantId''\)::uuid/, "and to its tenant");
  // The guard must keep failing closed for everyone else.
  assert.match(scope, /Row is not in the current workspace/);
});

test("an employee whose last membership was just removed is still a valid target", () => {
  const scope = sql("schema-btb-remove-membership.sql");
  assert.match(scope, /NOT EXISTS\(SELECT 1 FROM public\.btb_location_access a2 WHERE a2\.employee_id=e\.id\)/,
    "a person with no memberships left must not be rejected");
  assert.match(scope, /AND e\.tenant_id=\(context->>'tenantId'\)::uuid/, "still tenant-scoped");
  assert.match(scope, /Person role cannot be managed by this console/, "role checks are untouched");
});

test("disabling a person revokes their durable sessions, not just their cookie", () => {
  const scope = sql("schema-btb-remove-revokes-sessions.sql");
  for (const fn of ["btb_admin_block_person", "btb_admin_remove_person"]) {
    assert.ok(scope.includes(`FUNCTION public.${fn}`), `${fn} must be redefined`);
  }
  assert.match(scope, /workspace_auth_sessions s SET revoked_at=now\(\)/);
  assert.match(scope, /workspace_credential_links l WHERE l\.employee_id=p_employee/,
    "a linked principal is revoked too");
  assert.match(scope, /active=false,login_enabled=false/, "the account is still disabled");
});
