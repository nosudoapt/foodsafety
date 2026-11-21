import { test } from "node:test";
import assert from "node:assert/strict";
import { btbSlugFromName, validBtbSlug } from "../src/lib/btb-admin";
import { btbDemoSlug } from "../src/lib/btb-demo";
import { canonicalBtbActivityPath } from "../src/lib/activity";

test("location slugs are readable, lowercase and never shadow a reserved route", () => {
  assert.equal(btbSlugFromName("Drumheller"), "drumheller");
  assert.equal(btbSlugFromName("St. John's / Airport"), "st-john-s-airport");
  assert.equal(btbSlugFromName("  "), "");
  for (const value of ["drumheller", "drumheller-2", "a", "a1"]) assert.equal(validBtbSlug(value), true, value);
  for (const value of ["Drumheller", "-drumheller", "drumheller-", "demo", "login", "admin", "api", "btb", "two words", "x".repeat(41)]) {
    assert.equal(validBtbSlug(value), false, value);
  }
});

test("the demo slug comes from the environment and stays unguessable/off by default", () => {
  const saved = process.env.BTB_DEMO_SLUG;
  try {
    delete process.env.BTB_DEMO_SLUG;
    assert.equal(btbDemoSlug(), null);
    for (const value of ["demo", "login", "admin", "api", "btb", "Not A Slug", "buns backstage"]) {
      process.env.BTB_DEMO_SLUG = value;
      assert.equal(btbDemoSlug(), null, value);
    }
    process.env.BTB_DEMO_SLUG = "Buns-Backstage-04c1eb";
    assert.equal(btbDemoSlug(), "buns-backstage-04c1eb");
  } finally {
    if (saved === undefined) delete process.env.BTB_DEMO_SLUG; else process.env.BTB_DEMO_SLUG = saved;
  }
});

test("activity history strips a location slug but keeps legacy page URLs", () => {
  assert.equal(canonicalBtbActivityPath("/btb/drumheller"), "/btb/demo");
  assert.equal(canonicalBtbActivityPath("/btb/drumheller/prep-list"), "/btb/demo/prep-list");
  assert.equal(canonicalBtbActivityPath("/btb/drumheller/platform/overview"), "/btb/demo/platform/overview");
  assert.equal(canonicalBtbActivityPath("/btb/prep-manual"), "/btb/demo/prep-manual");
  assert.equal(canonicalBtbActivityPath("/btb/demo"), "/btb/demo");
  assert.equal(canonicalBtbActivityPath("/btb/admin"), "/btb/admin");
  assert.equal(canonicalBtbActivityPath("/btb/login"), "/btb/login");
  assert.equal(canonicalBtbActivityPath("/btb/demo-login"), "/btb/demo-login");
});
