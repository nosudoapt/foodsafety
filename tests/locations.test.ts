import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_LOCATION_KEY,
  canSwitchLocation,
  resolveActiveLocation,
  visibleLocations,
  type SiteLocation,
} from "../src/lib/locations";

const SITES: SiteLocation[] = [
  { id: "a", name: "The Grill House" },
  { id: "b", name: "Piccadilly" },
  { id: "c", name: "Deansgate" },
];

test("multi-location owners and corporate see every site", () => {
  for (const role of ["multi_location_owner", "corporate"]) {
    assert.deepEqual(
      visibleLocations(role, SITES, [], "a").map((s) => s.id),
      ["a", "b", "c"],
      role
    );
  }
});

test("a single-site profile sees only its memberships and home site", () => {
  assert.deepEqual(
    visibleLocations("manager", SITES, ["b"], "a").map((s) => s.id),
    ["a", "b"]
  );
  assert.deepEqual(
    visibleLocations("staff", SITES, [], "c").map((s) => s.id),
    ["c"]
  );
});

test("an unassigned profile lands on the default site, not the whole group", () => {
  assert.deepEqual(
    visibleLocations("owner", SITES, [], null).map((s) => s.id),
    ["a"]
  );
});

test("no sites (SQL not applied / signed out) means nothing to scope by", () => {
  assert.deepEqual(visibleLocations("owner", [], [], "a"), []);
  assert.equal(resolveActiveLocation([], "a", "a"), null);
});

test("active location prefers the remembered choice, then home, then first", () => {
  const visible = visibleLocations("multi_location_owner", SITES, [], "b");
  assert.equal(resolveActiveLocation(visible, "c", "b"), "c");
  assert.equal(resolveActiveLocation(visible, "nope", "b"), "b");
  assert.equal(resolveActiveLocation(visible, null, null), "a");
  // A remembered site the profile lost access to never wins.
  assert.equal(resolveActiveLocation(visible, "gone", null), "a");
});

test("only owners and multi-location owners get the dashboard switcher", () => {
  assert.ok(canSwitchLocation("owner"));
  assert.ok(canSwitchLocation("multi_location_owner"));
  for (const role of ["staff", "manager", "corporate", "designer", null, "nonsense"]) {
    assert.equal(canSwitchLocation(role), false, String(role));
  }
});

test("the persisted key is stable — the switcher and the context must agree", () => {
  assert.equal(ACTIVE_LOCATION_KEY, "foodsafety.active_location_id");
});
