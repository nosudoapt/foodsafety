import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BTB_CARDS } from "../src/lib/btb-hub";
import { pageSlug } from "../src/lib/btb-page-access";
import { friendlyPathTitle } from "../src/lib/page-titles";
import { activeHref } from "../src/lib/admin-nav";

const root = join(__dirname, "../..");

test("src contains no old BTB routing dependencies except audited history normalization", () => {
  const src = join(root, "src");
  const offenders = readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(tsx?|jsx?|css)$/.test(file))
    .filter((file) => /["'`]\/between-the-buns(?:[\/"'`?#]|$)|@\/app\/between-the-buns/.test(readFileSync(join(src, file), "utf8")));
  // This pure normalizer reads already-stored historical paths; it does not
  // emit legacy navigation. Behaviour is covered by activity.test.ts.
  assert.deepEqual(offenders, ["lib/activity.ts"]);
  const normalizer = readFileSync(join(src, "lib/activity.ts"), "utf8");
  assert.ok(normalizer.includes("function canonicalBtbActivityPath("));
  assert.ok(!/\bhref\s*=|\bfetch\(|\bredirect\(|@\/app\/between-the-buns/.test(normalizer));
});

test("all moved cards preserve their persisted page slugs", () => {
  for (const card of BTB_CARDS) {
    assert.ok(card.href.startsWith("/btb/demo/"), card.href);
    assert.ok(pageSlug(card).length > 0, card.href);
    assert.ok(!pageSlug(card).startsWith("/"), card.href);
    assert.equal(pageSlug(card), card.href.slice("/btb/demo/".length));
  }
});

test("BTB titles omit the demo segment, the product prefix and truncation", () => {
  // Chips sit inside the BTB workspace, so naming the workspace on every pill
  // is noise and pushes the real page name into an ellipsis.
  assert.equal(friendlyPathTitle("/btb/demo"), "Overview");
  assert.equal(friendlyPathTitle("/btb/demo/cleaning-schedule"), "Cleaning");
  assert.equal(friendlyPathTitle("/btb/demo/training-guide"), "Training");
  assert.equal(friendlyPathTitle("/btb/demo/temperatures"), "Temperatures");
  assert.equal(friendlyPathTitle("/btb/admin"), "Admin");
  // Other products keep their prefix — their chips can sit beside BTB ones.
  assert.equal(friendlyPathTitle("/admin/demo"), "FoodSafe admin · Demo");
  // No BTB label is long enough to truncate in a pill.
  for (const page of ["prep-list", "month-end-inventory", "franchise-inspection", "new-restaurant", "staff-licenses"]) {
    assert.ok(friendlyPathTitle(`/btb/demo/${page}`).length <= 20, `${page} label fits a chip`);
  }
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
