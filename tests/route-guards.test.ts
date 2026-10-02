import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_ROUTE_ROLES,
  OPS_ROUTE_ROLES,
  PROTECTED_PREFIXES,
  isProtectedPath,
  requiredRolesFor,
  canAccess,
} from "../src/lib/route-guards";
import { ROLES, OWNER_TIER_ROLES, MGMT_ROLES, MARKETING_ROLES, OPERATIONAL_ROLES } from "../src/lib/roles";

// BTB is gated by its own cookie (see proxy.ts / btb-auth.ts), never by the
// demo's Supabase session — so these stay out of PROTECTED_PREFIXES.
test("BTB pages are outside the demo's Supabase gate", () => {
  assert.equal(isProtectedPath("/between-the-buns"), false);
  assert.equal(isProtectedPath("/between-the-buns/prep-list"), false);
  assert.equal(isProtectedPath("/between-the-buns/menu"), false);
  assert.equal(PROTECTED_PREFIXES.includes("/between-the-buns"), false);
  assert.equal(isProtectedPath("/auth/sign-in"), false);
  assert.equal(isProtectedPath("/"), false);
  assert.equal(isProtectedPath("/app"), false);
});

test("staff routes require a session, exact and nested", () => {
  for (const path of [
    "/dashboard",
    "/dashboard/anything",
    "/checks",
    "/cleaning",
    "/temperatures",
    "/allergens",
    "/deliveries",
    "/corrective-actions",
    "/pest-control",
    "/training",
    "/reports",
    "/settings",
    "/admin",
    "/admin/vault",
  ]) {
    assert.equal(isProtectedPath(path), true, `${path} should require auth`);
  }
});

test("prefix matching does not bleed across siblings", () => {
  assert.equal(isProtectedPath("/checks-history"), false);
  assert.equal(isProtectedPath("/adm"), false);
  assert.equal(isProtectedPath("/administration"), false);
});

test("only the gated admin subroutes carry role requirements", () => {
  // /admin is the redirect sink proxy.ts sends denied roles to, so it is the
  // one admin path with no role list — the admin layout moves the designer on
  // to /admin/marketing from there (Patch 11).
  assert.equal(requiredRolesFor("/admin"), null);
  assert.ok(ADMIN_ROUTE_ROLES.length > 0);
  assert.ok(PROTECTED_PREFIXES.includes("/admin"));
  assert.deepEqual(requiredRolesFor("/admin/vault"), [...OWNER_TIER_ROLES]);
  assert.deepEqual(requiredRolesFor("/admin/new-restaurant"), [...OWNER_TIER_ROLES]);

  const documents = requiredRolesFor("/admin/documents");
  assert.deepEqual(documents, [...MGMT_ROLES]);

  const handbook = requiredRolesFor("/admin/handbook");
  assert.deepEqual(handbook, [...OPERATIONAL_ROLES]);

  const marketing = requiredRolesFor("/admin/marketing");
  assert.deepEqual(marketing, [...MARKETING_ROLES]);
  assert.ok(marketing?.includes("designer"));
  assert.ok(marketing?.includes("manager"));
  assert.equal(marketing?.length, 5);
});

test("gated routes reference only known roles and never 'staff'", () => {
  for (const gate of ADMIN_ROUTE_ROLES) {
    assert.ok(gate.roles.length > 0, `${gate.prefix} has no roles`);
    for (const role of gate.roles) {
      assert.ok(
        (ROLES as readonly string[]).includes(role),
        `${gate.prefix} grants unknown role ${role}`
      );
    }
    assert.ok(!gate.roles.includes("staff"), `${gate.prefix} must not grant staff`);
  }
});

test("staff and manager are walled out of the vault", () => {
  assert.equal(canAccess("/admin/vault", "staff"), false);
  assert.equal(canAccess("/admin/vault", "manager"), false);
  assert.equal(canAccess("/admin/vault", "designer"), false);
  assert.equal(canAccess("/admin/vault", "owner"), true);
  assert.equal(canAccess("/admin/vault", "corporate"), true);
  assert.equal(canAccess("/admin/vault/anything", "owner"), true);
});

test("management tier reaches the compliance screens", () => {
  for (const path of [
    "/admin/compliance",
    "/admin/documents",
    "/admin/staff-licenses",
    "/admin/inspections",
    "/admin/manuals",
  ]) {
    assert.equal(canAccess(path, "manager"), true, `manager needs ${path}`);
    assert.equal(canAccess(path, "staff"), false, `staff must not reach ${path}`);
  }
  assert.equal(canAccess("/admin/marketing", "designer"), true);
  assert.equal(canAccess("/admin/print-materials", "staff"), true);
});

test("public paths are open to every role", () => {
  assert.equal(canAccess("/between-the-buns/cleaning-schedule", "staff"), true);
  assert.equal(canAccess("/", "staff"), true);
});

// Patch 11 — the designer is a marketing-only role.
test("designer is walled into the Marketing Portal", () => {
  // Reachable: the marketing dashboard and the portal itself, subroutes included.
  assert.equal(canAccess("/dashboard", "designer"), true);
  assert.equal(canAccess("/admin/marketing", "designer"), true);
  assert.equal(canAccess("/admin/marketing/calendar", "designer"), true);
  assert.equal(requiredRolesFor("/dashboard"), null);

  const adminPaths = [
    "/admin/vault",
    "/admin/new-restaurant",
    "/admin/compliance",
    "/admin/documents",
    "/admin/staff-licenses",
    "/admin/inspections",
    "/admin/manuals",
    "/admin/emergency",
    "/admin/protocols",
    "/admin/handbook",
    "/admin/print-materials",
  ];
  for (const path of adminPaths) {
    assert.equal(canAccess(path, "designer"), false, `designer must not reach ${path}`);
    assert.ok(
      requiredRolesFor(path) && !requiredRolesFor(path)!.includes("designer"),
      `${path} must stay gated for the proxy to enforce`
    );
  }

  // Operational sheets: staff keeps them, the designer never sees them.
  const sheets = PROTECTED_PREFIXES.filter((p) => p !== "/admin" && p !== "/dashboard");
  assert.ok(sheets.length > 0);
  for (const path of sheets) {
    assert.equal(canAccess(path, "designer"), false, `designer must not reach ${path}`);
    assert.equal(canAccess(`${path}/nested`, "designer"), false, `${path} must nest too`);
    assert.equal(canAccess(path, "staff"), true, `staff keeps ${path}`);
    assert.equal(canAccess(`${path}/nested`, "staff"), true, `staff keeps ${path}/nested`);
  }

  // The proxy enforces the same table (it reads requiredRolesFor, not canAccess).
  for (const gate of [...ADMIN_ROUTE_ROLES, ...OPS_ROUTE_ROLES]) {
    assert.ok(!gate.roles.includes("designer") || gate.prefix === "/admin/marketing",
      `${gate.prefix} must not grant the designer`);
  }
});

// The proxy matcher drives both gates: the Supabase gate (PROTECTED_PREFIXES)
// and the BTB cookie gate. Everything but BTB must mirror the Supabase list.
test("proxy matcher stays in sync with PROTECTED_PREFIXES", () => {
  const source = readFileSync(join(__dirname, "../../src/proxy.ts"), "utf8");
  const block = source.match(/matcher:\s*\[([\s\S]*?)\]/);
  assert.ok(block, "proxy config.matcher not found");
  const entries = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.ok(entry.endsWith("/:path*"), `${entry} must end in /:path*`);
  }
  const prefixes = entries.map((e) => e.replace(/\/:path\*$/, ""));

  assert.ok(prefixes.includes("/between-the-buns"), "BTB must be matched so its cookie gate runs");
  const supabaseGated = prefixes.filter((p) => p !== "/between-the-buns");
  assert.deepEqual([...supabaseGated].sort(), [...PROTECTED_PREFIXES].sort());
});
