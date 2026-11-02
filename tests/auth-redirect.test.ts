import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/auth-redirect";

test("return paths retain local destinations, query strings and anchors", () => {
  assert.equal(safeNextPath("/admin/documents?type=licence#uploads"), "/admin/documents?type=licence#uploads");
  assert.equal(safeNextPath(null), "/dashboard");
});

test("external, malformed and authentication-loop destinations use the fallback", () => {
  for (const path of ["https://other.example", "//other.example", "/\\other.example", "/%5cother.example", "/%2fother.example", " /checks", "/\n/other.example", "/auth/sign-in", "/auth/reset-password", "/between-the-buns/login"]) {
    assert.equal(safeNextPath(path), "/dashboard", path);
  }
});

test("BTB return links stay within BTB, including normalized path traversal", () => {
  const fallback = "/between-the-buns";
  for (const path of ["/dashboard", "/between-the-buns-other", "/between-the-buns/../admin", "/between-the-buns/%2e%2e/admin", "/between-the-buns/login?next=/dashboard"]) {
    assert.equal(safeNextPath(path, fallback, fallback), fallback, path);
  }
  assert.equal(safeNextPath("/between-the-buns/month-end-inventory", fallback, fallback), "/between-the-buns/month-end-inventory");
});
