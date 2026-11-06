import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BTB_ACCOUNTS,
  BTB_COOKIE,
  BTB_ROLES,
  accountForCredentials,
  btbPassword,
  btbPasswordIsDefault,
  isBtbRole,
  roleFromSession,
  sessionValueFor,
  tokenValid,
} from "../src/lib/btb-auth";
import { cardsForRole, hiddenCardsForRole, BTB_CARDS } from "../src/lib/btb-hub";
import { demoPassword } from "../src/lib/demo-server";

// Compiled tests run from .test-dist/tests/, so the project root is two levels up.
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

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
    assert.match(account.email, /@foodsafe\.demo$/);
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
  assert.equal(accountForCredentials("manager@foodsafe.demo", "wrong"), null);
  assert.equal(accountForCredentials("nobody@foodsafe.demo", btbPassword()), null);
  assert.equal(accountForCredentials("", ""), null);
});

test("one password works on both sign-in pages, but each checks its own list", () => {
  // Deliberate: the user asked for one credential across the green demo and
  // BTB. When the FoodSafe demo password is not overridden they use the same
  // value — otherwise owner@… + password would work on one page and not the other.
  if (!process.env.DEMO_PASSWORD) {
    assert.equal(btbPassword(), demoPassword(), "both surfaces must share a default password");
  }
  assert.equal(btbPasswordIsDefault(), process.env.NODE_ENV !== "production");

  // BTB still validates against BTB_ACCOUNTS only — an address it doesn't
  // know fails even with the correct shared password.
  assert.ok(accountForCredentials("manager@foodsafe.demo", btbPassword()));
  assert.equal(accountForCredentials("nobody@foodsafe.demo", btbPassword()), null);
});

test("production logins need no BTB environment settings and retain private, role-bound sessions", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "test-only-backend-service-key" };
  delete env.BTB_PASSWORD;
  delete env.BTB_SESSION_TOKEN;
  execFileSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const auth = require(${JSON.stringify(join(ROOT, ".test-dist/src/lib/btb-auth.js"))});
    for (const account of auth.BTB_ACCOUNTS) {
      assert.equal(auth.accountForCredentials(account.email, "admin1234").role, account.role);
    }
    assert.equal(auth.accountForCredentials("manager@foodsafe.demo", "wrong"), null);
    assert.equal(auth.btbPasswordIsDefault(), false);
    const shared = auth.sessionValueFor("manager");
    const employee = auth.employeeSessionValueFor({ id: "50000000-0000-4000-8000-000000000001", role: "staff", version: 1 });
    assert.equal(auth.roleFromSession(shared), "manager");
    assert.equal(auth.roleFromSession(employee), "staff");
    assert.equal(auth.roleFromSession(shared.replace(/^manager/, "admin")), null);
    assert.equal(auth.roleFromSession("manager.btb-dev-session-token"), null);
    for (const cookie of [shared, employee]) {
      assert.ok(!cookie.includes("admin1234"));
      assert.ok(!cookie.includes(process.env.SUPABASE_SERVICE_ROLE_KEY));
    }
    process.env.BTB_PASSWORD = "obsolete-env-password";
    process.env.BTB_SESSION_TOKEN = "obsolete-env-signing-key";
    assert.equal(auth.accountForCredentials("manager@foodsafe.demo", "admin1234").role, "manager");
    assert.equal(auth.accountForCredentials("manager@foodsafe.demo", "obsolete-env-password"), null);
    assert.equal(auth.sessionValueFor("manager"), shared);
    assert.equal(auth.roleFromSession(employee), "staff");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated-test-backend-key";
    assert.equal(auth.roleFromSession(shared), null);
    assert.equal(auth.roleFromSession(employee), null);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => auth.sessionValueFor("manager"), auth.BtbConfigurationError);
  `], { env, stdio: "pipe" });
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
  assert.equal(roleFromSession("admin1234"), null); // old shared-token format
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

  // Corporate sees every card except the admin dashboard (admin-only).
  const corpHidden = hiddenCardsForRole("corporate");
  assert.equal(corporate.length, BTB_CARDS.length - 1, "corporate sees all but one card");
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
      assert.ok(card.href.startsWith("/between-the-buns/"), `${card.href} is a BTB route`);
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

test("the password hint is gated to local development", () => {
  const me = read("src/app/api/btb/me/route.ts");
  assert.ok(me.includes("btbPasswordIsDefault()"), "hint must be gated to local development");
  assert.ok(me.includes("authenticated: false"), "signed-out response must expose the account list");

  const login = read("src/app/api/btb/login/route.ts");
  assert.ok(login.includes("accountForCredentials"), "route must check BTB's own list");
  assert.ok(login.includes("httpOnly: true"));
  assert.ok(login.includes("sessionValueFor"), "cookie must carry the role");
  assert.ok(login.includes("BTB_COOKIE"), "cookie name must come from btb-auth");
});

// --- 5. the proxy still gates every BTB page --------------------------------

test("proxy cookie-gates BTB and leaves its login open", () => {
  const source = read("src/proxy.ts");
  assert.ok(source.includes('pathname === "/between-the-buns/login"'));
  assert.ok(source.includes("tokenValid(request.cookies.get(BTB_COOKIE)"));
  assert.ok(source.includes('url.pathname = "/between-the-buns/login"'));
  assert.ok(source.includes('url.searchParams.set("next", pathname)'));
});

// --- 6. BTB stays decoupled from the green demo -----------------------------

test("BTB navigation and authentication stay independent, with an explicit legacy temperature-history link", () => {
  const root = join(ROOT, "src/app/between-the-buns");
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => join(root, f));

  assert.ok(files.length >= 10, "expected the full BTB route tree");
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const hrefs = [...source.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      const legacyHistory = file === join(root, "temperatures/page.tsx") && href === "/temperatures";
      assert.ok(
        href.startsWith("/between-the-buns") || href.startsWith("#") || legacyHistory,
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

  const sidebar = readFileSync(join(ROOT, "src/components/Sidebar.tsx"), "utf8");
  assert.ok(!sidebar.includes("between-the-buns"));
});
