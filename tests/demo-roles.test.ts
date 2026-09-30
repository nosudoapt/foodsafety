import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEMO_ACCOUNTS, DEMO_ROLES, isDemoEmail, isDemoRole, demoAccountFor } from "../src/lib/demo-roles";
import { demoCredentialsFor, demoPassword } from "../src/lib/demo-server";
import { ROLES, OWNER_TIER_ROLES, MGMT_ROLES, isRole } from "../src/lib/roles";
import { canAccess, requiredRolesFor } from "../src/lib/route-guards";

// Compiled tests run from .test-dist/tests/, so the project root is two levels up.
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// --- 1. the roster stays inside roles.ts -------------------------------------

test("demo accounts cover the four selling perspectives", () => {
  assert.deepEqual([...DEMO_ROLES].sort(), ["corporate", "manager", "owner", "staff"]);
});

test("every demo role is a real role from roles.ts", () => {
  for (const role of DEMO_ROLES) {
    assert.ok((ROLES as readonly string[]).includes(role), `${role} not in ROLES`);
    assert.ok(isDemoRole(role));
  }
  assert.equal(isDemoRole("superuser"), false);
  assert.equal(isDemoRole("designer"), false); // real role, but not a demo account
  assert.equal(isDemoRole(undefined), false);
});

test("demo accounts are well-formed and unique", () => {
  const emails = new Set<string>();
  for (const account of DEMO_ACCOUNTS) {
    assert.ok(isRole(account.role), `${account.role} must be a Role`);
    assert.match(account.email, /@foodsafe\.demo$/);
    assert.ok(account.label && account.headline && account.desc);
    assert.ok(account.fullName && account.restaurantName);
    assert.equal(emails.has(account.email), false, `duplicate ${account.email}`);
    emails.add(account.email);
    assert.equal(demoAccountFor(account.role), account);
  }
  assert.equal(isDemoEmail("owner@foodsafe.demo"), true);
  assert.equal(isDemoEmail("OWNER@FOODSAFE.DEMO"), true);
  assert.equal(isDemoEmail("someone@else.com"), false);
  assert.equal(isDemoEmail(null), false);
});

// --- 2. credentials never leave the server -----------------------------------

test("demo credentials resolve per role and reject anything else", () => {
  const owner = demoCredentialsFor("owner");
  assert.ok(owner);
  assert.equal(owner.email, "owner@foodsafe.demo");
  assert.equal(owner.password, demoPassword());

  for (const role of DEMO_ROLES) {
    const creds = demoCredentialsFor(role);
    assert.ok(creds, `${role} must resolve`);
    assert.equal(creds.password, demoPassword());
    assert.equal(demoAccountFor(role)?.email, creds.email);
  }

  assert.equal(demoCredentialsFor("designer"), null);
  assert.equal(demoCredentialsFor("nonsense"), null);
  assert.equal(demoCredentialsFor(undefined), null);
});

test("the demo password never ships in client-reachable source", () => {
  const forbidden = ["src/app", "src/components", "src/contexts"];
  const secret = demoPassword();
  const exempt = new Set([
    "src/lib/demo-server.ts", // server-only resolver
    "src/app/api/demo/session/route.ts", // server route that calls it
  ]);
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const rel = path.replace(ROOT + "/", "");
        if (exempt.has(rel)) continue;
        if (forbidden.some((d) => rel.startsWith(d)) && readFileSync(path, "utf8").includes(secret)) {
          offenders.push(rel);
        }
      }
    }
  };
  forbidden.forEach((d) => walk(join(ROOT, d)));
  assert.deepEqual(offenders, [], `demo password leaked into ${offenders.join(", ")}`);
});

test("the demo sign-in route only accepts a role, never a password", () => {
  const route = read("src/app/api/demo/session/route.ts");
  assert.ok(route.includes("demoCredentialsFor"), "route must resolve credentials server-side");
  assert.ok(route.includes("process.env"), "route must be env-aware"); // demo-server, indirectly
  assert.ok(!route.includes("body?.password"), "client must not send a password");
  const picker = read("src/components/DemoRolePicker.tsx");
  assert.ok(picker.includes("/api/demo/session"));
  assert.ok(picker.includes("JSON.stringify({ role })"), "picker must send a role only");
});

// --- 3. each demo role hits the real server-side RBAC ------------------------

test("owner sees everything in the admin panel", () => {
  assert.ok(OWNER_TIER_ROLES.includes("owner"));
  for (const path of ["/admin/vault", "/admin/new-restaurant", "/admin/compliance", "/admin/documents", "/admin/inspections"]) {
    assert.equal(canAccess(path, "owner"), true, `owner needs ${path}`);
  }
});

test("manager runs operations but is walled out of vault and new-restaurant", () => {
  assert.ok(MGMT_ROLES.includes("manager"));
  for (const path of ["/admin/compliance", "/admin/documents", "/admin/staff-licenses", "/admin/inspections", "/admin/marketing"]) {
    assert.equal(canAccess(path, "manager"), true, `manager needs ${path}`);
  }
  for (const path of ["/admin/vault", "/admin/new-restaurant"]) {
    assert.equal(canAccess(path, "manager"), false, `manager must not reach ${path}`);
    assert.deepEqual(requiredRolesFor(path), [...OWNER_TIER_ROLES]);
  }
});

test("staff gets an operational shift and no privileged admin routes", () => {
  assert.equal(canAccess("/dashboard", "staff"), true);
  assert.equal(canAccess("/temperatures", "staff"), true);
  assert.equal(canAccess("/admin", "staff"), true); // shared admin landing has no gate
  for (const path of ["/admin/vault", "/admin/compliance", "/admin/documents", "/admin/new-restaurant", "/admin/marketing"]) {
    assert.equal(canAccess(path, "staff"), false, `staff must not reach ${path}`);
    assert.ok(!requiredRolesFor(path)?.includes("staff"), `${path} must not grant staff`);
  }
});

test("corporate is owner-tier: full vault access, read-only by convention", () => {
  assert.ok(OWNER_TIER_ROLES.includes("corporate"));
  assert.equal(canAccess("/admin/vault", "corporate"), true);
  assert.equal(canAccess("/admin/compliance", "corporate"), true);
  assert.equal(canAccess("/admin/new-restaurant", "corporate"), true);
});

// --- 4. the dashboard really is different per role ---------------------------

test("every role in roles.ts maps to a dashboard view", () => {
  const source = read("src/app/dashboard/page.tsx");
  const block = source.match(/const VIEW_FOR_ROLE: Record<Role, ViewKey> = \{([\s\S]*?)\};/);
  assert.ok(block, "VIEW_FOR_ROLE map not found");
  const mapped = [...block[1].matchAll(/(\w+):\s*"(owner|manager|staff|rollup|mlo|designer)"/g)].map((m) => m[1]);
  assert.deepEqual([...mapped].sort(), [...ROLES].sort(), "each role needs exactly one view");

  for (const key of ["owner", "manager", "staff", "rollup", "mlo", "designer"]) {
    assert.ok(new RegExp(`^  ${key}: \\{`, "m").test(source), `view "${key}" not defined`);
  }
});

test("staff view is genuinely simpler than the owner view", () => {
  const source = read("src/app/dashboard/page.tsx");
  const staffBlock = source.slice(source.indexOf("  staff: {"), source.indexOf("  rollup: {"));
  const ownerBlock = source.slice(source.indexOf("  owner: {"), source.indexOf("  manager: {"));

  assert.ok(staffBlock.length > 0 && ownerBlock.length > 0);
  assert.ok(!staffBlock.includes("/admin/"), "staff view must not surface admin links");
  assert.ok(!staffBlock.includes('href: "/reports"'), "staff view should not push reporting");
  assert.ok(ownerBlock.includes("/admin/vault"), "owner view should surface the vault");
  assert.ok(ownerBlock.includes("/admin/new-restaurant"), "owner view should surface new-restaurant");
  assert.ok(ownerBlock.length > staffBlock.length, "owner view should offer more than staff");
});

test("manager view offers operations admin but never the vault", () => {
  const source = read("src/app/dashboard/page.tsx");
  const managerBlock = source.slice(source.indexOf("  manager: {"), source.indexOf("  staff: {"));
  assert.ok(managerBlock.includes("/admin/compliance"));
  assert.ok(managerBlock.includes("/admin/staff-licenses"));
  assert.ok(!managerBlock.includes("/admin/vault"));
  assert.ok(!managerBlock.includes("/admin/new-restaurant"));
});

test("corporate view is framed as a read-only rollup", () => {
  const source = read("src/app/dashboard/page.tsx");
  const rollupBlock = source.slice(source.indexOf("  rollup: {"), source.indexOf("  mlo: {"));
  assert.ok(rollupBlock.includes("Read-only"), "rollup must be labelled read-only");
  assert.ok(rollupBlock.includes("/admin/inspections/corporate"));
  assert.ok(!rollupBlock.includes("/admin/vault"));
});

// --- 5. the entry points exist ----------------------------------------------

test("sign-in offers one-click demo roles and links to the picker", () => {
  const signIn = read("src/app/auth/sign-in/page.tsx");
  assert.ok(signIn.includes("DemoRoleButtons"), "sign-in needs the demo panel");
  assert.ok(signIn.includes('href="/demo"'));
  assert.ok(read("src/app/demo/page.tsx").includes("DemoRoleCards"));
});

test("the badge offers a way back to the picker", () => {
  const badge = read("src/components/DemoRoleBadge.tsx");
  assert.ok(badge.includes("Demo —"), "badge must read 'Demo — {role}'");
  assert.ok(badge.includes('href="/demo"'), "badge must link back to the picker");
  assert.ok(badge.includes("isDemoEmail"), "badge must only show for demo sessions");

  const sidebar = read("src/components/Sidebar.tsx");
  assert.equal((sidebar.match(/<DemoRoleBadge/g) ?? []).length, 2, "badge in mobile header + desktop rail");
});

test("the picker itself stays out of the demo", () => {
  assert.equal(isDemoEmail("nobody@foodsafe.demo"), false);
  assert.ok(read("src/app/demo/page.tsx").includes('href="/auth/sign-in"'));
});

// --- 6. seed file matches the code ------------------------------------------

test("seed SQL creates exactly the accounts the app expects", () => {
  const seed = read("supabase/seed-demo.sql");
  for (const account of DEMO_ACCOUNTS) {
    assert.ok(seed.includes(`'${account.email}'`), `seed must create ${account.email}`);
    assert.ok(seed.includes(`'${account.role}'`), `seed must set role ${account.role}`);
  }
  assert.ok(seed.includes(demoPassword()), "seed password must match demoPassword()");
  for (const role of ROLES) {
    assert.ok(seed.includes(`'${role}'`), `role CHECK must allow ${role}`);
  }
  assert.ok(seed.includes("trial_ends_at"), "seed must provision the trial column");
  assert.ok(seed.includes("handle_new_user"), "seed must provision the signup trigger");
});
