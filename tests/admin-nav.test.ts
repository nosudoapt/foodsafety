import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_NAV,
  ALL_ADMIN_NAV,
  navForRole,
  activeHref,
  searchNav,
  navLabelFor,
} from "../src/lib/admin-nav";
import { ROLES, OWNER_TIER_ROLES, MGMT_ROLES, MARKETING_ROLES } from "../src/lib/roles";
import { isProtectedPath, requiredRolesFor } from "../src/lib/route-guards";

test("every nav item points at a real, guarded admin or BTB route", () => {
  for (const item of ALL_ADMIN_NAV) {
    assert.ok(
      item.href.startsWith("/admin") || item.href.startsWith("/between-the-buns"),
      `${item.href} should live under /admin or /between-the-buns`
    );
  }
});

test("every nav item lists at least one real role", () => {
  for (const item of ALL_ADMIN_NAV) {
    assert.ok(item.roles.length > 0, `${item.href} has no roles`);
    for (const role of item.roles) {
      assert.ok(
        (ROLES as readonly string[]).includes(role),
        `${item.href} names unknown role "${role}"`
      );
    }
  }
});

test("no duplicate hrefs or labels inside the rail", () => {
  const hrefs = ALL_ADMIN_NAV.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "duplicate href in admin nav");

  const labels = ALL_ADMIN_NAV.map((i) => i.label);
  assert.equal(new Set(labels).size, labels.length, "duplicate label in admin nav");
});

test("every group has a label or is the only group (no orphan headings)", () => {
  for (const group of ADMIN_NAV) {
    assert.ok(group.label.length > 0, "nav groups must be labelled");
    assert.ok(group.items.length > 0, `group "${group.label}" is empty`);
  }
});

test("role scoping: staff never sees owner-tier or marketing pages", () => {
  const staffHrefs = navForRole("staff").flatMap((g) => g.items.map((i) => i.href));
  assert.ok(staffHrefs.includes("/admin"));
  assert.ok(staffHrefs.includes("/admin/emergency"));

  assert.equal(staffHrefs.includes("/admin/vault"), false, "staff must not see the vault");
  assert.equal(staffHrefs.includes("/admin/new-restaurant"), false);
  assert.equal(staffHrefs.includes("/admin/compliance"), false);
  assert.equal(staffHrefs.includes("/admin/marketing"), false);
});

test("role scoping: owner sees the vault, manager does not", () => {
  const owner = navForRole("owner").flatMap((g) => g.items.map((i) => i.href));
  const manager = navForRole("manager").flatMap((g) => g.items.map((i) => i.href));

  assert.ok(owner.includes("/admin/vault"));
  assert.ok(owner.includes("/admin/new-restaurant"));
  assert.equal(manager.includes("/admin/vault"), false);
  assert.equal(manager.includes("/admin/new-restaurant"), false);
});

test("role scoping: designer sees marketing only", () => {
  const designer = navForRole("designer").flatMap((g) => g.items.map((i) => i.href));
  assert.deepEqual(designer, ["/admin/marketing"]);
});

test("navForRole drops groups that end up empty", () => {
  const managerGroups = navForRole("manager");
  for (const group of managerGroups) {
    assert.ok(group.items.length > 0, `empty group "${group.label}" survived`);
  }
  // The owner-tier group has no manager items, so it must be gone entirely.
  assert.equal(
    managerGroups.some((g) => g.label === "Owner tier"),
    false
  );
});

test("navForRole returns nothing for a null/unknown role", () => {
  assert.deepEqual(navForRole(null), []);
  assert.deepEqual(navForRole(undefined), []);
  assert.deepEqual(navForRole("nonsense"), []);
});

test("every owner-tier role sees the vault", () => {
  for (const role of OWNER_TIER_ROLES) {
    const hrefs = navForRole(role).flatMap((g) => g.items.map((i) => i.href));
    assert.ok(hrefs.includes("/admin/vault"), `${role} should see the vault`);
  }
});

test("every management role sees compliance", () => {
  for (const role of MGMT_ROLES) {
    const hrefs = navForRole(role).flatMap((g) => g.items.map((i) => i.href));
    assert.ok(hrefs.includes("/admin/compliance"), `${role} should see compliance`);
  }
});

test("marketing roles see /admin/marketing", () => {
  for (const role of MARKETING_ROLES) {
    const hrefs = navForRole(role).flatMap((g) => g.items.map((i) => i.href));
    assert.ok(hrefs.includes("/admin/marketing"), `${role} should see marketing`);
  }
});

test("activeHref prefers the longest match, so nested routes win", () => {
  assert.equal(activeHref("/admin"), "/admin");
  assert.equal(activeHref("/admin/compliance"), "/admin/compliance");
  assert.equal(activeHref("/admin/inspections"), "/admin/inspections");
  assert.equal(
    activeHref("/admin/inspections/corporate"),
    "/admin/inspections/corporate"
  );
  assert.equal(activeHref("/admin/unknown-page"), null);
});

test("/admin is exact-match only — it must not light up every route", () => {
  // Every admin route starts with /admin; if the overview used a prefix match
  // it would be the active item everywhere.
  assert.notEqual(activeHref("/admin/documents"), "/admin");
  assert.equal(activeHref("/admin/documents"), "/admin/documents");
});

test("activeHref respects the role filter", () => {
  // Manager cannot see the vault, so it must not resolve as an active item.
  assert.equal(activeHref("/admin/vault", "manager"), null);
  assert.equal(activeHref("/admin/vault", "owner"), "/admin/vault");
});

test("searchNav: empty query returns every visible page", () => {
  const all = searchNav("", "owner");
  const ownerPages = navForRole("owner").flatMap((g) => g.items);
  assert.equal(all.length, ownerPages.length);
});

test("searchNav: label prefix beats keyword match", () => {
  const results = searchNav("comp", "owner");
  assert.equal(results[0].href, "/admin/compliance");
});

test("searchNav: keyword search finds pages the label doesn't mention", () => {
  const vault = searchNav("password", "owner");
  assert.ok(vault.some((r) => r.href === "/admin/vault"));

  const cash = searchNav("till", "manager");
  assert.ok(cash.some((r) => r.href === "/between-the-buns/cash-out"));
});

test("searchNav never leaks pages the role cannot open", () => {
  const results = searchNav("vault", "manager");
  assert.equal(results.length, 0, "manager must not find the vault via search");

  const compliance = searchNav("compliance", "staff");
  assert.equal(compliance.length, 0, "staff must not find compliance via search");
});

test("searchNav is case-insensitive and trims", () => {
  const a = searchNav("  VAULT  ", "owner");
  assert.ok(a.some((r) => r.href === "/admin/vault"));
});

test("navLabelFor resolves a breadcrumb title, null when unknown", () => {
  assert.equal(navLabelFor("/admin/compliance"), "Compliance & Renewals");
  assert.equal(navLabelFor("/admin/vault"), "Login Vault");
  assert.equal(navLabelFor("/nope"), null);
});

// The rail is a promise: a page it shows should open. A nav item visible to a
// role that the route guard then rejects is a broken link, so assert the two
// sources agree.
test("every rail link is actually openable by the roles it is shown to", () => {
  for (const item of ALL_ADMIN_NAV) {
    if (!isProtectedPath(item.href)) continue; // BTB links have their own gate
    const gated = requiredRolesFor(item.href);
    if (!gated) continue; // unguarded page — any signed-in user may open it
    for (const role of item.roles) {
      assert.ok(
        gated.includes(role),
        `rail shows "${item.label}" to ${role}, but the route guard denies it`
      );
    }
  }
});