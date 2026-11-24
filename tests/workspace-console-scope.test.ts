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
import { workspacePageAllowed } from "../src/lib/workspace-page-access";
import { resolveBtbLocation } from "../src/lib/btb-location-context";
import type { BtbEffectiveAccess } from "../src/lib/btb-page-access";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("a console may open the console and any branch it administers, nothing else", () => {
  const c = claims({});
  const slugs = ["calgary", "drumheller"];
  assert.equal(workspacePageAllowed("/btb/admin", c, slugs), true);
  assert.equal(workspacePageAllowed("/btb/admin/locations/x", c, slugs), true);
  assert.equal(workspacePageAllowed("/btb/drumheller", c, slugs), true);
  assert.equal(workspacePageAllowed("/btb/drumheller/prep-list", c, slugs), true);
  assert.equal(workspacePageAllowed("/btb/ancoats", c, slugs), false, "not in this estate");
  assert.equal(workspacePageAllowed("/dashboard", c, slugs), false, "a console is not a restaurant account");
});

test("an employee is still pinned to its own branch", () => {
  const e = claims({ principalType: "employee", role: "manager", locationId: calgary, permittedView: "/btb/calgary" });
  assert.equal(workspacePageAllowed("/btb/calgary/prep-list", e, ["calgary", "drumheller"]), true);
  assert.equal(workspacePageAllowed("/btb/drumheller/prep-list", e, ["calgary", "drumheller"]), false);
  assert.equal(workspacePageAllowed("/btb/admin", e, ["calgary"]), false);
});

test("a console resolves a branch without an employee record", () => {
  const access = (id: string): BtbEffectiveAccess => ({
    rows: [], locationIds: [id], pageGrants: null,
    locations: [{ id, name: "Drumheller", slug: "drumheller", active: true }], pages: [], locationWorkspace: true,
  });
  const consoleIdentity = {
    role: "owner" as const, name: "Nitpreet Singh", email: "nitpreetsingh05@gmail.com", employeeId: null,
    console: true, tenantId: "60000000-0000-4000-8000-000000000001", currentLocationId: drumheller,
  };
  assert.deepEqual(resolveBtbLocation(consoleIdentity, access(drumheller)),
    { id: drumheller, name: "Drumheller", slug: "drumheller" });
  // The console still cannot invent a branch outside its scope.
  assert.throws(() => resolveBtbLocation(consoleIdentity, access(calgary)), /not in your workspace/);
});

test("the branch boundary is enforced on the server, not just by the link", () => {
  const boundary = readFileSync(join(__dirname, "..", "..", "src/components/btb/BtbServerPage.tsx"), "utf8");
  assert.match(boundary, /slug !== current\.slug/, "the rendered branch must be the session's branch");
  assert.match(boundary, /principalType === "console"/, "a console may enter a branch workspace");
  const proxy = readFileSync(join(__dirname, "..", "..", "src/proxy.ts"), "utf8");
  assert.match(proxy, /workspacePageAllowed\(path, claims, branchSlugs\)/);
  assert.match(proxy, /item\.slug === entered\?\.\[1\]/, "the console branch comes from its own assignments");
});
