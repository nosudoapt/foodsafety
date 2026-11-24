import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { legacyFolderTarget, workspacePageAllowed } from "../src/lib/workspace-page-access";
import type { WorkspaceClaims } from "../src/lib/workspace-auth-types";

// npm test runs compiled files from .test-dist/tests; a direct tsx run does not.
const root = existsSync(join(__dirname, "..", "..", "src")) ? join(__dirname, "..", "..") : join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const consoleClaims = {
  sub: "p1", principalType: "console", tenantId: "t1", tenantSlug: "between-the-buns",
  locationId: "loc-drum", allowedLocationIds: ["loc-drum", "loc-calgary"], role: "admin",
  permittedView: "/btb/admin", version: 1, exp: 0, sid: "s1",
} as unknown as WorkspaceClaims;
const sites = [{ id: "loc-drum", slug: "drumheller" }, { id: "loc-calgary", slug: "calgary" }];

// "Clicking Drumheller opens /btb/drumheller then returns to /btb/admin" was two
// separate ejections: the workspace layout rejected a console principal, and
// every in-workspace link (/btb/demo/...) went to permittedView, which for a
// console is the console itself.
test("a console may open a branch it administers", () => {
  assert.equal(workspacePageAllowed("/btb/drumheller", consoleClaims, ["drumheller", "calgary"]), true);
  assert.equal(workspacePageAllowed("/btb/drumheller/prep-list", consoleClaims, ["drumheller", "calgary"]), true);
  assert.equal(workspacePageAllowed("/btb/elsewhere", consoleClaims, ["drumheller", "calgary"]), false);
  assert.equal(workspacePageAllowed("/btb/admin", consoleClaims, ["drumheller", "calgary"]), true);
});

test("the internal folder keeps the branch and the sub-path", () => {
  assert.equal(legacyFolderTarget("/btb/demo", consoleClaims, sites), "/btb/drumheller");
  assert.equal(legacyFolderTarget("/btb/demo/prep-list", consoleClaims, sites), "/btb/drumheller/prep-list");
  assert.equal(legacyFolderTarget("/btb/demo", { ...consoleClaims, principalType: "employee", locationId: "loc-calgary" } as WorkspaceClaims, sites),
    "/btb/calgary");
});

test("a session with no branch, or a non-branch principal, still goes to its own view", () => {
  assert.equal(legacyFolderTarget("/btb/demo/x", { ...consoleClaims, locationId: "loc-gone" } as WorkspaceClaims, sites), "/btb/admin");
  assert.equal(legacyFolderTarget("/btb/demo/x", { ...consoleClaims, principalType: "supabase" } as WorkspaceClaims, sites), "/btb/admin");
});

test("the workspace layout admits a console and refuses another branch's chrome", () => {
  const layout = read("src", "app", "btb", "demo", "layout.tsx");
  assert.match(layout, /\["employee", "console"\]\.includes\(claims\.principalType\)/,
    "a console was rejected here and bounced to /btb/admin");
  assert.match(layout, /claims\.tenantSlug !== "between-the-buns"/);
  assert.match(layout, /requested !== site\.slug\) redirect\(`\/btb\/\$\{site\.slug\}`\)/,
    "mismatched chrome must go to the branch the session is in");
  const proxy = read("src", "proxy.ts");
  assert.match(proxy, /legacyFolderTarget\(path, claims, session\.principal\.locations\)/);
});
