import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BTB_CARDS } from "../src/lib/btb-hub";
import { pageSlug } from "../src/lib/btb-page-access";
import { friendlyPathTitle } from "../src/lib/page-titles";
import { activeHref } from "../src/lib/admin-nav";

const root = join(__dirname, "../..");

test("src contains no old BTB route literals or module specifiers", () => {
  const src = join(root, "src");
  const offenders = readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(tsx?|jsx?|css)$/.test(file))
    .filter((file) => /["'`]\/between-the-buns(?:[\/"'`?#]|$)|@\/app\/between-the-buns/.test(readFileSync(join(src, file), "utf8")));
  assert.deepEqual(offenders, []);
});

test("all moved cards preserve their persisted page slugs", () => {
  for (const card of BTB_CARDS) {
    assert.ok(card.href.startsWith("/btb/demo/"), card.href);
    assert.ok(pageSlug(card).length > 0, card.href);
    assert.ok(!pageSlug(card).startsWith("/"), card.href);
    assert.equal(pageSlug(card), card.href.slice("/btb/demo/".length));
  }
});

test("BTB titles omit the demo segment without changing other products", () => {
  assert.equal(friendlyPathTitle("/btb/demo"), "Between the Buns");
  assert.equal(friendlyPathTitle("/btb/demo/cleaning-schedule"), "Between the Buns · Cleaning schedule");
  assert.equal(friendlyPathTitle("/btb/admin"), "Between the Buns · Admin");
  assert.equal(friendlyPathTitle("/admin/demo"), "FoodSafe admin · Demo");
});

test("connected-workspace roots are not active on unrelated nested pages", () => {
  assert.equal(activeHref("/btb/demo/prep-list"), null);
  assert.equal(activeHref("/btbx/demo"), null);
  assert.equal(activeHref("/btb/demo"), "/btb/demo");
});

test("old bookmarks have ordered permanent redirects", () => {
  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  const rules = [...config.matchAll(/source: "([^"]+)", destination: "([^"]+)", permanent: true/g)]
    .map((match) => [match[1], match[2]]);
  assert.deepEqual(rules, [
    ["/between-the-buns/login", "/btb/login"],
    ["/between-the-buns", "/btb/demo"],
    ["/between-the-buns/:path*", "/btb/demo/:path*"],
  ]);
});
