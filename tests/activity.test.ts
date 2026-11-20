import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activityLocationId, activityPath, activityPathInWorkspace, activitySummary, btbActivityPathAllowed, canonicalBtbActivityPath } from "../src/lib/activity";

test("activity paths reject URLs, traversal, fragments, queries and unbounded input", () => {
  assert.equal(activityPath("/btb/demo/menu/"), "/btb/demo/menu");
  for (const value of [null, "https://example.test", "//example.test", "/btb\\demo", "/btb/demo?token=secret", "/btb/demo#content", "/btb/../admin", "/btb/./demo", "/" + "a".repeat(300), "/btb/\n/demo"]) assert.equal(activityPath(value), null);
});

test("only exactly-one-location employees receive server-owned attribution", () => {
  assert.equal(activityLocationId("person", ["site-a"]), "site-a");
  assert.equal(activityLocationId("person", ["site-a", "site-b"]), null);
  assert.equal(activityLocationId("person", []), null);
  assert.equal(activityLocationId(null, ["site-a"]), null);
});

test("BTB activity respects independent page grants and limits platform child paths", () => {
  const access = { pages: ["prep-manual", "platform"] };
  for (const path of ["/btb/demo", "/btb/demo/account", "/btb/demo/prep-manual", "/btb/demo/platform", "/btb/demo/platform/overview", "/btb/demo/platform/settings"]) assert.equal(btbActivityPathAllowed(path, access), true, path);
  for (const path of ["/btb/demo/menu", "/btb/demo/vault", "/btb/admin", "/btb/demo/prep-manual/forged", "/btb/demo/platform/forged", "/admin/vault"]) assert.equal(btbActivityPathAllowed(path, access), false, path);
  assert.equal(btbActivityPathAllowed("/btb/demo/platform", { pages: [] }), false);
  assert.equal(activityPathInWorkspace("/admin/vault", "btb"), false);
  assert.equal(activityPathInWorkspace("/btb/demo/menu", "foodsafe"), false);
  assert.equal(activityPathInWorkspace("/between-the-buns/menu", "foodsafe"), false);
});

test("historical BTB activity canonicalizes without converting console or login URLs", () => {
  assert.equal(canonicalBtbActivityPath("/between-the-buns/menu"), "/btb/demo/menu");
  assert.equal(canonicalBtbActivityPath("/btb/prep-manual"), "/btb/demo/prep-manual");
  assert.equal(canonicalBtbActivityPath("/btb"), "/btb/demo");
  assert.equal(canonicalBtbActivityPath("/btb/admin/locations"), "/btb/admin/locations");
  assert.equal(canonicalBtbActivityPath("/btb/login/set-password"), "/btb/login/set-password");
});

test("activity summaries use server titles, distinct paths and newest recency", () => {
  const result = activitySummary([
    { path: "/btb/demo/menu", title: "Forged title", created_at: "2026-11-18" },
    { path: "/btb/demo/menu", title: "Secret", created_at: "2026-11-20" },
    { path: "/btb/demo/prep-manual", created_at: "2026-11-19" },
  ]);
  assert.equal(result.recent.length, 2);
  assert.equal(result.recent[0].at, "2026-11-20");
  assert.equal(result.top[0].visits, 2);
  assert.ok(!JSON.stringify(result).includes("Forged title") && !JSON.stringify(result).includes("Secret"));
});

test("activity routes isolate product identities and never accept browser location attribution", () => {
  const route = readFileSync(join(__dirname, "../../src/app/api/activity/route.ts"), "utf8");
  assert.ok(route.includes('searchParams.get("workspace") ?? "foodsafe"'));
  assert.ok(route.includes("await requireBtbAccess()"));
  assert.ok(route.includes("btbActivityPathAllowed(path, actor.access)"));
  assert.ok(route.includes("requireBtbOrigin(request") && route.includes("readBody(request, 4096)"));
  assert.ok(!route.includes("body.locationId"));
  assert.equal((route.match(/\.eq\("actor_type", actor.actorType\)/g) ?? []).length, 2);
  assert.equal((route.match(/\.eq\("restaurant_name", actor.restaurant\)/g) ?? []).length, 2);
});
