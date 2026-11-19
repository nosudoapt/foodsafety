import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/auth-redirect";

test("return paths retain local destinations, query strings and anchors", () => {
  assert.equal(safeNextPath("/admin/documents?type=licence#uploads"), "/admin/documents?type=licence#uploads");
  assert.equal(safeNextPath(null), "/dashboard");
});

test("external, malformed and authentication-loop destinations use the fallback", () => {
  for (const path of ["https://other.example", "//other.example", "/\\other.example", "/%5cother.example", "/%2fother.example", " /checks", "/\n/other.example", "/auth/sign-in", "/auth/reset-password", "/btb/login"]) {
    assert.equal(safeNextPath(path), "/dashboard", path);
  }
});

test("BTB return links stay within BTB, including normalized path traversal", () => {
  const fallback = "/btb/demo";
  for (const path of ["/dashboard", "/btb-other", "/btb/demo/../admin", "/btb/demo/%2e%2e/admin", "/btb/login?next=/dashboard"]) {
    assert.equal(safeNextPath(path, fallback, fallback), fallback, path);
  }
  assert.equal(safeNextPath("/btb/demo/month-end-inventory", fallback, fallback), "/btb/demo/month-end-inventory");
});

test("admin and demo return targets cannot cross surfaces", () => {
  assert.equal(safeNextPath("/btb/demo", "/btb/admin", "/btb/admin"), "/btb/admin");
  assert.equal(safeNextPath("/btb/admin/locations/123", "/btb/demo", "/btb/demo"), "/btb/demo");
  assert.equal(safeNextPath("/btb/admin-other", "/btb/admin", "/btb/admin"), "/btb/admin");
  assert.equal(safeNextPath("/btb/admin/login", "/btb/admin", "/btb/admin"), "/btb/admin");
  assert.equal(safeNextPath("/btb/admin/locations/123?tab=people", "/btb/admin", "/btb/admin"), "/btb/admin/locations/123?tab=people");
});
