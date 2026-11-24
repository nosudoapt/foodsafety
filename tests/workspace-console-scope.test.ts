import assert from "node:assert/strict";
import { test } from "node:test";
import { scopeRpcRequest, type WorkspaceDatabaseScope } from "../src/lib/workspace-db-policy";
import type { WorkspaceAuthContext, WorkspaceClaims } from "../src/lib/workspace-auth-types";

// A console's authority is its estate, not the single branch its durable session
// is pinned to. These pin the resulting boundary: a console may act on any of
// its own branches, and nobody else gains anything.
const calgary = "20000000-0000-4000-8000-000000000001";
const drumheller = "20000000-0000-4000-8000-000000000002";
const stranger = "20000000-0000-4000-8000-000000000003";

const claims = (over: Partial<WorkspaceClaims>): WorkspaceClaims => ({
  sub: "50000000-0000-4000-8000-000000000001", principalType: "console", tenantId: "60000000-0000-4000-8000-000000000001",
  tenantSlug: "between-the-buns", locationId: calgary, allowedLocationIds: [calgary, drumheller], role: "admin",
  permittedView: "/btb/admin", version: 3, exp: Math.floor(Date.now() / 1000) + 3600, sid: "70000000-0000-4000-8000-000000000001",
  ...over,
});

const principal = (credentialId = "80000000-0000-4000-8000-000000000001"): WorkspaceAuthContext => ({
  sub: "50000000-0000-4000-8000-000000000001", principalType: "console", credentialId, version: 3, sourceVersion: 1,
  active: true, principalActive: true, tenantId: "60000000-0000-4000-8000-000000000001", role: "admin",
  name: "Alex Console", email: "console@workspace.test", tenantSlug: "between-the-buns", tenantName: "Between the Buns",
  locations: [{ id: calgary, name: "Calgary", slug: "calgary" }, { id: drumheller, name: "Drumheller", slug: "drumheller" }],
});

const scope = (c: WorkspaceClaims, consoleLocationIds: string[]): WorkspaceDatabaseScope =>
  ({ claims: c, principal: principal(), tables: [], employeeIds: [], consoleLocationIds });

test("a console may act on any branch of its estate, not just the pinned one", () => {
  const s = scope(claims({}), [calgary, drumheller]);
  const args = scopeRpcRequest("btb_admin_people", "POST", { p_location: drumheller }, s);
  assert.equal(args.p_location, drumheller, "the requested branch is preserved");
  // Its own pinned branch keeps working too.
  assert.equal(scopeRpcRequest("btb_admin_people", "POST", { p_location: calgary }, s).p_location, calgary);
});

test("a branch outside the console's assignments is still refused", () => {
  const s = scope(claims({}), [calgary, drumheller]);
  assert.throws(() => scopeRpcRequest("btb_admin_people", "POST", { p_location: stranger }, s), /not the current workspace/);
});

test("an employee gains nothing from the console rule", () => {
  const employee = claims({ principalType: "employee", role: "manager", locationId: calgary, permittedView: "/btb/calgary" });
  const s = scope(employee, []); // employees never carry a console estate
  assert.equal(scopeRpcRequest("btb_save_temperature_sheet_scoped", "POST", { p_location: calgary }, s).p_location, calgary);
  assert.throws(() => scopeRpcRequest("btb_save_temperature_sheet_scoped", "POST", { p_location: drumheller }, s), /not the current workspace/);
});

test("an empty console estate refuses even the session's own branch id collision", () => {
  const s = scope(claims({}), []);
  assert.equal(scopeRpcRequest("btb_admin_people", "POST", { p_location: calgary }, s).p_location, calgary, "own branch always allowed");
  assert.throws(() => scopeRpcRequest("btb_admin_people", "POST", { p_location: drumheller }, s));
});
