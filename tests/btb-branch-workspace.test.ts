import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { btbAuthority, btbCanEdit, btbCanView } from "../src/lib/btb-access";
import { accessibleBtbCards, btbPageAllowed } from "../src/lib/btb-page-access";
import { btbCountQuery } from "../src/lib/btb-dashboard";

const root = existsSync(join(__dirname, "..", "..", "src")) ? join(__dirname, "..", "..") : join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

// Entering a branch from the console: the workspace must read that branch, and
// the owner must be able to work it — read-only everywhere is not "entering".
test("a console inside a branch writes the operational tools the owner cannot", () => {
  for (const feature of ["prep_list", "checklists", "cleaning_schedule", "temperatures", "cash_out", "month_end_inventory", "order_sheet", "staff_schedule", "employees"] as const) {
    assert.equal(btbCanEdit(feature, "owner"), false, `${feature}: the owner tier alone stays view-only, as documented`);
    assert.equal(btbCanEdit(feature, "owner", true), true, `${feature}: the console may write inside the branch it entered`);
  }
  assert.equal(btbCanEdit("compliance", "owner"), false, "compliance edits are a manager action for the owner tier too");
  assert.equal(btbCanEdit("compliance", "owner", true), true);
  // Nobody else gains anything: the flag rides on the verified session, and the
  // matrix is unchanged for every real store role.
  assert.equal(btbCanEdit("cash_out", "staff"), false);
  assert.equal(btbCanEdit("cash_out", "supervisor"), false);
  assert.equal(btbCanEdit("month_end_inventory", "supervisor"), false);
});

test("a console keeps the owner-tier pages as well as the manager ones", () => {
  assert.equal(btbCanView("franchise_inspection", "owner"), true);
  assert.equal(btbCanView("inspections", "owner"), false, "owner tier alone cannot open the inspections register");
  assert.equal(btbCanView("inspections", "owner", true), true);
  assert.equal(btbCanView("admin_dashboard", "owner", true), false, "the console flag does not hand out admin pages");
});

test("page grants widen with the console flag but saved restrictions still apply", () => {
  const receipts = accessibleBtbCards("owner", [], null, true).map((card) => card.feature);
  assert.ok(receipts.includes("order_sheet"), "the order sheet is reachable");
  const restricted = [{ role: "owner" as const, page: "prep-list", allowed: false }];
  const card = accessibleBtbCards("owner", [], null, true).find((item) => item.href === "/btb/demo/prep-list")!;
  assert.equal(btbPageAllowed(card, "owner", restricted, null, true), false, "a saved restriction is not overridden");
});

test("operational gates treat the console as the branch manager", () => {
  assert.equal(btbAuthority("owner", true), "manager");
  assert.equal(btbAuthority("owner", false), "owner");
  for (const route of ["inventory-finalize", "inventory-reopen", "inventory-purchases", "clock-policy", "task-assignments"]) {
    const source = read("src", "app", "api", "btb", route, "route.ts");
    assert.match(source, /btbAuthority\(/, `${route} must not pin the console out of its own branch`);
  }
});

test("branch figures are counted for the branch, not the group", () => {
  const drum = "11111111-1111-4111-8111-111111111111";
  for (const id of ["checksToday", "prepToday", "cleaningToday", "ordersToday", "renewals", "licensesDue", "inspectionsMonth", "campaigns"] as const) {
    const query = btbCountQuery(id, "2026-11-21", drum)!;
    assert.deepEqual(query.filters.find((filter) => filter.column === "location_id"),
      { column: "location_id", op: "eq", value: drum }, `${id} must filter its branch`);
  }
  const legacy = btbCountQuery("prepToday", "2026-11-21")!;
  assert.deepEqual(legacy.filters.find((filter) => filter.column === "location_id"), { column: "location_id", op: "isNull" });
});

test("the branch workspace admits a console, scopes to one branch, and offers the way back", () => {
  const access = read("src", "lib", "btb-effective-access.ts");
  assert.match(access, /loadConsoleBtbAccess\(serviceDb\(\), identity\)/, "the console's branch access no longer takes the whole estate");
  assert.match(access, /\.eq\("id", branchId\)/, "one branch is read, not the group");
  const shell = read("src", "app", "btb", "demo", "shell.tsx");
  assert.match(shell, /\{identity\?\.console && <Link href="\/btb\/admin"/, "a console gets one click back to the console");
  const me = read("src", "app", "api", "btb", "me", "route.ts");
  assert.match(me, /console: identity\.console === true/, "the client must know it is acting as a console");
});

test("the sign-in form cannot paint a false password error", () => {
  const page = read("src", "app", "auth", "sign-in", "page.tsx");
  assert.doesNotMatch(page, /\?\? "Invalid email or password"/, "a missing error body must not become a password error");
  assert.match(page, /inFlight\.current = true/, "submits are single-flight even before React re-renders");
  assert.match(page, /signedIn\.current = true/, "a late response cannot repaint an error after success");
  assert.match(page, /We couldn’t sign you in just now/, "a platform failure reads like one");
});


test("a branch's page leads with its people, and head-office tools stay out of the way", () => {
  const hub = read("src", "app", "btb", "demo", "hub.tsx");
  const cardAt = hub.indexOf("<PeopleCard");
  const metricsAt = hub.indexOf('aria-label="Key figures"');
  assert.ok(cardAt > 0 && metricsAt > cardAt, "the people card comes before the figures");
  assert.match(hub, /const HQ_TOOLS = new Set\(\["franchise_inspection", "marketing", "new_restaurant", "branding_requests", "vault"\]\)/,
    "the group-only surfaces are named once");
  assert.match(hub, /const branchMatches = hq \? matches\.filter\(\(card\) => !HQ_TOOLS\.has\(card\.feature\)\) : matches;/);
  assert.match(hub, /branchMatches\.filter\(\(card\) => btbCardGroup\(card\) === group\)/, "the branch grid uses the branch list");
  assert.match(hub, /className="btb-hq"><summary>Head-office tools/, "and the rest is one collapsed section");
});

test("the people card offers invitation, and the form opens on arrival", () => {
  const card = read("src", "app", "btb", "demo", "PeopleCard.tsx");
  assert.match(card, /href="\/btb\/demo\/employees\?action=invite"/);
  assert.match(card, /href="\/btb\/demo\/employees\?action=add"/);
  assert.match(card, /btbCanView\("employees", identity\.role, identity\.console === true\)/, "only a viewer of the team sees it");
  const view = read("src", "app", "btb", "demo", "employees", "view.tsx");
  assert.match(view, /params\.get\("action"\)/);
  assert.match(view, /if \(action === "invite"\) \{ setInviteReceipt\(null\); setInviting\("new"\); \}/);
});

test("a console reads the team of the branch it entered", () => {
  const route = read("src", "app", "api", "btb", "employees", "route.ts");
  assert.match(route, /if \(identity\.console && identity\.currentLocationId\) return identity\.currentLocationId;/);
});
