import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BTB_ACCOUNTS,
  BTB_COOKIE,
  BTB_ROLES,
  accountForCredentials,
  btbPassword,
  isBtbRole,
  roleFromSession,
  sessionValueFor,
  tokenValid,
} from "../src/lib/btb-auth";
import { cardsForRole, hiddenCardsForRole, BTB_CARDS } from "../src/lib/btb-hub";

// Compiled tests run from .test-dist/tests/, so the project root is two levels up.
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// The shared workspace password must come from the environment (HTTP-01).
// This is a synthetic test value, never a real credential.
process.env.BTB_PASSWORD = "test-only-shared-password";

// --- 1. BTB's own credential list -------------------------------------------

test("BTB defines five legacy shared roles plus personal designer/owner roles", () => {
  assert.deepEqual([...BTB_ROLES], ["staff", "supervisor", "manager", "designer", "corporate", "owner", "admin"]);
  // Designer and Owner are personal, membership-scoped roles. A shared
  // password account for either would bypass location isolation, so the
  // shared workspace list must stay exactly these five.
  assert.deepEqual([...BTB_ACCOUNTS.map((a) => a.role)].sort(), ["admin", "corporate", "manager", "staff", "supervisor"]);
  for (const role of ["designer", "owner"] as const) {
    assert.ok(!BTB_ACCOUNTS.some((account) => account.role === role), `${role} must not have a shared workspace account`);
  }
  for (const account of BTB_ACCOUNTS) {
    assert.ok(isBtbRole(account.role));
    assert.match(account.email, /@btb\.demo$/);
    assert.ok(account.name && account.restaurant);
  }
  assert.equal(new Set(BTB_ACCOUNTS.map((a) => a.email)).size, BTB_ACCOUNTS.length);
  assert.equal(isBtbRole("superuser"), false);
});

test("one shared password unlocks every BTB account", () => {
  for (const account of BTB_ACCOUNTS) {
    const matched = accountForCredentials(account.email, btbPassword());
    assert.equal(matched?.role, account.role, `${account.email} must sign in`);
    // email matching is case/whitespace tolerant
    assert.equal(accountForCredentials(` ${account.email.toUpperCase()} `, btbPassword())?.role, account.role);
  }
  assert.equal(accountForCredentials("manager@btb.demo", "wrong"), null);
  assert.equal(accountForCredentials("nobody@btb.demo", btbPassword()), null);
  assert.equal(accountForCredentials("", ""), null);
});

test("the shared password comes from BTB_PASSWORD and fails closed when it is missing", () => {
  // BTB still validates against BTB_ACCOUNTS only — an address it doesn't
  // know fails even with the correct shared password.
  assert.ok(accountForCredentials("manager@btb.demo", btbPassword()));
  assert.equal(accountForCredentials("nobody@btb.demo", btbPassword()), null);
  assert.equal(accountForCredentials("manager@btb.demo", "wrong"), null);
  // No built-in fallback may exist in any environment.
  const saved = process.env.BTB_PASSWORD;
  delete process.env.BTB_PASSWORD;
  try {
    assert.throws(() => btbPassword(), /not configured/);
    assert.throws(() => accountForCredentials("manager@btb.demo", "admin1234"), /not configured/);
  } finally {
    if (saved === undefined) delete process.env.BTB_PASSWORD; else process.env.BTB_PASSWORD = saved;
  }
});

test("production logins require BTB_PASSWORD and retain private, role-bound sessions", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "test-only-backend-service-key" };
  env.BTB_PASSWORD = "test-only-shared-password";
  execFileSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const auth = require(${JSON.stringify(join(ROOT, ".test-dist/src/lib/btb-auth.js"))});
    for (const account of auth.BTB_ACCOUNTS) {
      assert.equal(auth.accountForCredentials(account.email, "test-only-shared-password").role, account.role);
    }
    assert.equal(auth.accountForCredentials("manager@btb.demo", "wrong"), null);
    const shared = auth.sessionValueFor("manager");
    const employee = auth.employeeSessionValueFor({ id: "50000000-0000-4000-8000-000000000001", role: "staff", version: 1 });
    assert.equal(auth.roleFromSession(shared), "manager");
    assert.equal(auth.roleFromSession(employee), "staff");
    assert.equal(auth.roleFromSession(shared.replace(/^manager/, "admin")), null);
    assert.equal(auth.roleFromSession("manager.btb-dev-session-token"), null);
    for (const cookie of [shared, employee]) {
      assert.ok(!cookie.includes("test-only-shared-password"));
      assert.ok(!cookie.includes(process.env.SUPABASE_SERVICE_ROLE_KEY));
    }
    // The environment is read live, so rotating BTB_PASSWORD takes effect
    // without a rebuild; the previous value must stop working.
    process.env.BTB_PASSWORD = "rotated-test-password";
    assert.equal(auth.accountForCredentials("manager@btb.demo", "rotated-test-password").role, "manager");
    assert.equal(auth.accountForCredentials("manager@btb.demo", "test-only-shared-password"), null);
    assert.equal(auth.sessionValueFor("manager"), shared);
    assert.equal(auth.roleFromSession(employee), "staff");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated-test-backend-key";
    assert.equal(auth.roleFromSession(shared), null);
    assert.equal(auth.roleFromSession(employee), null);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => auth.sessionValueFor("manager"), auth.BtbConfigurationError);
  `], { env, stdio: "pipe" });

  // Fail closed: production with no BTB_PASSWORD must reject every login
  // instead of falling back to a built-in password.
  const closed: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "test-only-backend-service-key" };
  delete closed.BTB_PASSWORD;
  delete closed.NEXT_PUBLIC_SUPABASE_URL;
  execFileSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const auth = require(${JSON.stringify(join(ROOT, ".test-dist/src/lib/btb-auth.js"))});
    assert.throws(() => auth.accountForCredentials("manager@btb.demo", "admin1234"), auth.BtbConfigurationError);
    assert.throws(() => auth.accountForCredentials("manager@btb.demo", "rotated-test-password"), auth.BtbConfigurationError);
  `], { env: closed, stdio: "pipe" });
});

// --- 2. the session cookie carries the role ---------------------------------

test("session values round-trip to exactly one role", () => {
  for (const role of BTB_ROLES) {
    assert.equal(roleFromSession(sessionValueFor(role)), role);
    assert.equal(tokenValid(sessionValueFor(role)), true);
  }
  // pinning these: renaming the cookie signs every tablet out, and embedding
  // the password in the cookie would hand it to anyone who can read their own.
  assert.equal(BTB_COOKIE, "btb_session");
  assert.ok(!sessionValueFor("manager").includes(btbPassword()));
});

test("tampered, legacy and role-less session values are rejected", () => {
  assert.equal(roleFromSession(undefined), null);
  assert.equal(roleFromSession(null), null);
  assert.equal(roleFromSession(""), null);
  assert.equal(roleFromSession("legacy-shared-token"), null); // old role-less token format
  assert.equal(roleFromSession("owner."), null);
  assert.equal(roleFromSession(".btb-dev-session-token"), null);
  assert.equal(roleFromSession("wizard.btb-dev-session-token"), null);
  assert.equal(roleFromSession("manager.wrong-token"), null);
  assert.equal(tokenValid("manager.wrong-token"), false);
  // Regression: changing only the role prefix must NOT escalate/downgrade a
  // signed cookie; the signature binds the cookie to exactly one role.
  assert.equal(roleFromSession(sessionValueFor("manager").replace(/^manager/, "staff")), null);
});

// --- 3. hub cards really differ per role ------------------------------------

test("hub cards are role-gated by the access matrix", () => {
  const staff = cardsForRole("staff");
  const supervisor = cardsForRole("supervisor");
  const management = cardsForRole("manager");
  const corporate = cardsForRole("corporate");

  // Staff never see the Order Sheet or any management/compliance surface.
  assert.ok(!staff.some((c) => c.href.endsWith("/order-sheet")));
  assert.ok(!staff.some((c) => c.href.endsWith("/vault")));
  assert.ok(!staff.some((c) => c.href.endsWith("/compliance")));

  // Supervisor sits above staff: sees the order sheet + compliance, but not the
  // vault, marketing, new-restaurant or the corporate report.
  assert.ok(supervisor.some((c) => c.href.endsWith("/order-sheet")));
  assert.ok(supervisor.some((c) => c.href.endsWith("/compliance")));
  assert.ok(!supervisor.some((c) => c.href.endsWith("/vault")));
  assert.ok(!supervisor.some((c) => c.href.endsWith("/franchise-inspection")));

  // Managers/owners see the order sheet and the vault (vendor logins).
  assert.ok(management.some((c) => c.href.endsWith("/order-sheet")));
  assert.ok(management.some((c) => c.href.endsWith("/vault")));

  // The corporate report and new-restaurant are HQ-only — hidden from managers.
  assert.ok(!management.some((c) => c.href.endsWith("/franchise-inspection")));
  assert.ok(!management.some((c) => c.href.endsWith("/new-restaurant")));

  // Corporate sees every card except the admin dashboard (admin-only). Card
  // count counts hub tiles only (hub:false routes are pages inside a card).
  const corpHidden = hiddenCardsForRole("corporate");
  const hubTiles = BTB_CARDS.filter((c) => c.hub !== false);
  assert.equal(corporate.length, hubTiles.length - 1, "corporate sees all but one card");
  assert.deepEqual(corpHidden.map((c) => c.feature), ["admin_dashboard"]);
  assert.ok(!corporate.some((c) => c.href.endsWith("/admin")), "corporate must not reach the admin dashboard");
});

test("every role sees most of the hub, and all cards belong to BTB", () => {
  for (const role of BTB_ROLES) {
    const cards = cardsForRole(role);
    if (role === "admin") {
      // Admin is deliberately walled into the admin dashboard only.
      assert.equal(cards.length, 1, "admin sees only the admin dashboard");
      assert.equal(cards[0].feature, "admin_dashboard");
    } else {
      assert.ok(cards.length >= 6, `${role} should see a full-looking hub`);
    }
    for (const card of cards) {
      assert.ok(card.href.startsWith("/btb/demo/"), `${card.href} is a BTB route`);
    }
  }
  assert.equal(new Set(BTB_CARDS.map((c) => c.href)).size, BTB_CARDS.length, "no duplicate cards");
  // an unknown role sees nothing rather than everything
  assert.deepEqual(cardsForRole("nonsense"), []);
});

// --- 4. the server-side secret never reaches the client ---------------------

test("no client component imports the module holding BTB's password", () => {
  const offenders: string[] = [];
  const srcRoot = join(ROOT, "src");
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) {
        const source = readFileSync(path, "utf8");
        if (!/^["']use client["']/m.test(source)) continue;
        if (/from\s+["'][^"']*btb-auth["']/.test(source)) {
          offenders.push(path.replace(ROOT + "/", ""));
        }
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(offenders, [], `client files must import ./btb-roles, not ./btb-auth: ${offenders.join(", ")}`);
});

test("the shared workspace door is retired, not merely disabled by a flag", () => {
  // One sign-in for everyone: the per-role shared door and its API are gone.
  assert.equal(existsSync(join(ROOT, "src/app/api/btb/login/route.ts")), false);
  assert.equal(existsSync(join(ROOT, "src/app/api/btb/demo-login/route.ts")), false);
  assert.equal(existsSync(join(ROOT, "src/app/btb/login/page.tsx")), false);
  // And nothing can mint the old store cookie any more.
  const minted = readdirSync("src/app/api", { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join("src/app/api", file))
    .filter((file) => /sessionValueFor\(|employeeSessionValueFor\(/.test(read(file)));
  assert.deepEqual(minted, []);
});

test("the signed-out response never enumerates shared or employee accounts", () => {
  const me = read("src/app/api/btb/me/route.ts");
  assert.ok(!me.includes("passwordHint"), "no password hint may be returned to anonymous callers");
  assert.ok(!me.includes("btbPassword"), "the password module must not be consulted by the anonymous response");
  assert.ok(!me.includes("BTB_ACCOUNTS"), "the shared account list must not be returned to anonymous callers");
  assert.ok(!me.includes("btb_employees"), "anonymous callers must not enumerate employee emails");
  assert.ok(me.includes("authenticated: false"), "signed-out response must identify itself");
  assert.ok(me.includes("requireWorkspaceSession"), "identity comes from the one verified session");

  const login = read("src/app/api/auth/login/route.ts");
  assert.ok(login.includes("loginWorkspace"), "the unified door resolves one authoritative credential");
  assert.ok(login.includes("INVALID_LOGIN"), "a refusal is uniform, never a hint about which store matched");
  const bridge = read("src/lib/workspace-auth-server.ts");
  assert.ok(bridge.includes("httpOnly: true"), "the session cookie is httpOnly");
  assert.ok(!bridge.includes("BTB_COOKIE"), "the retired store cookie is never minted");
});

// --- 5. the proxy still gates every BTB page --------------------------------

test("proxy gates BTB on the verified session and retires the old doors", () => {
  const source = read("src/proxy.ts");
  assert.ok(source.includes("workspaceSessionFromValue"), "the proxy verifies the signed session");
  assert.ok(source.includes("retiredDoor"), "/btb/login and friends redirect to the unified door");
  assert.ok(source.includes("pathWithin(path, \"/btb\")") || source.includes('pathWithin(path, "/btb")'), "BTB pages are gated");
  assert.ok(source.includes("workspacePageAllowed"), "each page is checked against the session");
  assert.ok(source.includes("x-btb-slug"), "the resolved location slug reaches the server layout");
  assert.ok(source.includes("NextResponse.rewrite"), "location URLs render the existing pages without exposing /btb/demo");
  assert.ok(source.includes("requestHeaders.delete(name)") && source.includes('"x-btb-slug"'), "a client cannot inject a branch header");
});

// --- 6. BTB stays decoupled from the green demo -----------------------------

test("BTB navigation and authentication stay independent, with an explicit legacy temperature-history link", () => {
  const root = join(ROOT, "src/app/btb/demo");
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => join(root, f));

  assert.ok(files.length >= 10, "expected the full BTB route tree");
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const hrefs = [...source.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      const legacyHistory = file === join(root, "temperatures/view.tsx") && href === "/temperatures";
      // A console that entered a branch gets one click back to the group
      // console. It is the only outward link in this tree, and it is rendered
      // only for that session (asserted below), never for a branch employee.
      const consoleReturn = file === join(root, "shell.tsx") && href === "/btb/admin";
      assert.ok(
        href === "/btb/demo" || href.startsWith("/btb/demo/") || href.startsWith("#") || legacyHistory || consoleReturn,
        `${file} must not link out to ${href}`
      );
    }
    // BTB's own auth is the cookie in btb-auth.ts — Supabase may only ever be
    // used here as a data store (prep/order tables are public by design), never
    // to establish a session or identify a user.
    assert.ok(
      !/supabase\.auth\.|signInWithPassword|getSession\(/.test(source),
      `${file} must not use Supabase for auth`
    );
  }

  // The only way out of this tree is the console's own return link, and it is
  // gated on the session being a console.
  const shell = readFileSync(join(root, "shell.tsx"), "utf8");
  assert.ok(shell.includes('{identity?.console && <Link href="/btb/admin"'), "the return link is console-only");

  const sidebar = readFileSync(join(ROOT, "src/components/Sidebar.tsx"), "utf8");
  assert.ok(!sidebar.includes("btb/demo"));
});
