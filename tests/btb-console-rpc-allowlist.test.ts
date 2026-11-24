import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { scopeRpcRequest, type WorkspaceDatabaseScope } from "../src/lib/workspace-db-policy";
import type { WorkspaceAuthContext, WorkspaceClaims } from "../src/lib/workspace-auth-types";

// A console RPC the scoped policy does not list is denied *before* it reaches
// Postgres, and btbAdminRpc then reports its generic fallback — which is how
// "Re-invite" failed with "The invitation could not be created" while the SQL
// itself was fine. Keep the allowlist and the product's calls in step.
const CONSOLE_RPCS = [
  "btb_admin_locations", "btb_admin_monitoring", "btb_admin_people", "btb_admin_create_location",
  "btb_admin_update_location", "btb_admin_add_person", "btb_admin_issue_invite", "btb_admin_reinvite",
  "btb_admin_remove_person", "btb_admin_block_person", "btb_admin_reset_password",
];

const claims: WorkspaceClaims = {
  sub: "50000000-0000-4000-8000-000000000001", principalType: "console",
  tenantId: "60000000-0000-4000-8000-000000000001", tenantSlug: "between-the-buns",
  locationId: "20000000-0000-4000-8000-000000000001", allowedLocationIds: ["20000000-0000-4000-8000-000000000001"],
  role: "admin", permittedView: "/btb/admin", version: 3, exp: Math.floor(Date.now() / 1000) + 3600,
  sid: "70000000-0000-4000-8000-000000000001",
};
const principal: WorkspaceAuthContext = {
  sub: claims.sub, principalType: "console", credentialId: "80000000-0000-4000-8000-000000000001",
  version: 3, sourceVersion: 1, active: true, principalActive: true, tenantId: claims.tenantId, role: "admin",
  name: "Alex Console", email: "console@workspace.test", tenantSlug: "between-the-buns", tenantName: "Between the Buns",
  locations: [],
};
const scope: WorkspaceDatabaseScope = { claims, principal, tables: [], employeeIds: [], consoleLocationIds: [] };

test("every console RPC the product calls is allowed by the scoped policy", () => {
  const policy = readFileSync(join(__dirname, "..", "..", "src/lib/workspace-db-policy.ts"), "utf8");
  const missing = CONSOLE_RPCS.filter((name) => !policy.includes(`"${name}"`));
  assert.deepEqual(missing, [], `these RPCs would be denied before reaching Postgres: ${missing.join(", ")}`);
});

test("re-inviting an employee is permitted for a console", () => {
  const args = scopeRpcRequest("btb_admin_reinvite", "POST", {
    p_actor: principal.credentialId, p_session: 1,
    p_location: claims.locationId, p_employee: "90000000-0000-4000-8000-000000000001",
    p_token_hash: "a".repeat(64), p_subject: "Invitation", p_body: "Body",
  }, scope);
  assert.equal(args.p_employee, "90000000-0000-4000-8000-000000000001");
  assert.equal(args.p_token_hash, "a".repeat(64));
});

test("an unknown console RPC is still refused", () => {
  assert.throws(() => scopeRpcRequest("btb_admin_drop_everything", "POST", {}, scope));
});
