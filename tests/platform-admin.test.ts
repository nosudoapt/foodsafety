import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// HTTP-05 regression: the platform owner pane may not be claimed anonymously.
// The first passcode can only be set by presenting the one-time
// PLATFORM_ADMIN_BOOTSTRAP_TOKEN from the server environment.
// NOTE: platform-admin.ts imports "server-only", which cannot load in plain
// node, so these are source-level assertions. The behavioural proof runs
// against the built app in qa/http-checks.mjs (HTTP-05).

// Compiled tests run from .test-dist/tests/, so the project root is two levels up.
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("the session route gates the first claim behind the bootstrap token", () => {
  const route = read("src/app/api/platform/session/route.ts");
  // The bootstrap check must happen before anything is persisted.
  const check = route.indexOf("matchesBootstrapToken(");
   const insert = route.indexOf(".insert(");
  assert.ok(check > 0, "claim path must call matchesBootstrapToken");
  assert.ok(insert > check, "the insert-only singleton claim must come after the bootstrap check");
  assert.ok(!route.includes(".upsert("), "an upsert must never overwrite a concurrent bootstrap winner");
  assert.ok(route.includes('error?.code === "23505"'), "a concurrent primary-key conflict must be refused before setting a cookie");
  assert.ok(route.includes("403"), "an unauthorised claim must be refused with 403");
});

test("the bootstrap check fails closed without the environment variable", () => {
  const source = read("src/lib/platform-admin.ts");
  assert.ok(source.includes('process.env.PLATFORM_ADMIN_BOOTSTRAP_TOKEN'), "the token must come from the environment, not the request");
  // Fails closed: missing env or token must refuse, with a constant-time compare.
  assert.match(source, /if \(!expected \|\| !token\) return false;/, "missing env or token must refuse");
  assert.ok(source.includes("timingSafeEqual"), "the token comparison must be constant-time");
});

test("verifyAgainst still reports ok / claim / wrong exactly", () => {
  const source = read("src/lib/platform-admin.ts");
  assert.match(source, /if \(!hash\) return "claim";/, "a missing hash must remain the claim signal");
  assert.match(source, /return matchesPasscode\(hash, passcode\) \? "ok" : "wrong";/, "stored hashes are verified, not trusted");
});

test("the sign-in screen only asks for a bootstrap token in first-time mode", () => {
  const page = read("src/app/platform/page.tsx");
  assert.ok(page.includes("bootstrapToken"), "first-time claim form must collect the bootstrap token");
  assert.ok(page.includes("PLATFORM_ADMIN_BOOTSTRAP_TOKEN"), "the form must tell the operator where the token comes from");
  assert.ok(page.includes("firstTime ? { passcode, bootstrapToken"), "only the first-time submit sends the token");
});
