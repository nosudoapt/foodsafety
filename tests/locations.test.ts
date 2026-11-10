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
  { id: "b", name: "Piccadilly" },
  { id: "c", name: "Deansgate" },
  { id: "d", name: "Ancoats" },
];

test("multi-location owners and corporate see every site", () => {
  for (const role of ["multi_location_owner", "corporate"]) {
    assert.deepEqual(
      visibleLocations(role, SITES, [], "b").map((s) => s.id),
      ["b", "c", "d"],
      role
    );
  }
});

test("a single-site profile sees only its memberships and home site", () => {
  assert.deepEqual(
    visibleLocations("manager", SITES, ["c"], "b").map((s) => s.id),
    ["b", "c"]
  );
  assert.deepEqual(
    visibleLocations("staff", SITES, [], "c").map((s) => s.id),
    ["c"]
  );
});

test("an unassigned profile lands on the default site, not the whole group", () => {
  assert.deepEqual(
    visibleLocations("owner", SITES, [], null).map((s) => s.id),
    ["b"]
  );
});

test("no sites (SQL not applied / signed out) means nothing to scope by", () => {
  assert.deepEqual(visibleLocations("owner", [], [], "b"), []);
  assert.equal(resolveActiveLocation([], "b", "b"), null);
});

test("active location prefers the remembered choice, then home, then first", () => {
  const visible = visibleLocations("multi_location_owner", SITES, [], "b");
  assert.equal(resolveActiveLocation(visible, "c", "d"), "c");
  assert.equal(resolveActiveLocation(visible, "nope", "d"), "d");
  assert.equal(resolveActiveLocation(visible, null, null), "b");
  // A remembered site the profile lost access to never wins.
  assert.equal(resolveActiveLocation(visible, "gone", null), "b");
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
