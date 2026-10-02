import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURES,
  MATRIX,
  accessFor,
  canView,
  canEdit,
  type Access,
} from "../src/lib/permissions";
import { ROLES, type Role } from "../src/lib/roles";

const LEVELS: Access[] = ["edit", "view", "notify", "none"];

test("every feature has a complete, valid row for all six roles", () => {
  for (const f of FEATURES) {
    assert.ok(MATRIX[f], `missing row for ${f}`);
    for (const r of ROLES) {
      const level = MATRIX[f][r];
      assert.ok(LEVELS.includes(level), `${f} × ${r} = ${level} is not a valid access level`);
    }
  }
});

test("no orphan features and no orphan roles in the matrix", () => {
  assert.equal(Object.keys(MATRIX).length, FEATURES.length);
  for (const f of FEATURES) {
    assert.deepEqual(Object.keys(MATRIX[f]).sort(), [...ROLES].sort());
  }
});

test("staff never touches the vault, agreements or user management", () => {
  const walled: (keyof typeof MATRIX)[] = [
    "login_vault",
    "franchise_agreement",
    "lease_agreement",
    "user_management",
    "new_restaurant",
    "group_rollup",
  ];
  for (const f of walled) {
    assert.equal(accessFor(f, "staff"), "none", `staff must have no access to ${f}`);
  }
});

test("only owner-tier can edit the vault, agreements and new restaurant", () => {
  const ownerTier: Role[] = ["owner", "multi_location_owner"];
  for (const r of ROLES) {
    const expected = ownerTier.includes(r);
    assert.equal(canEdit("new_restaurant", r), expected, `new_restaurant edit for ${r}`);
    assert.equal(canEdit("login_vault", r), expected, `login_vault edit for ${r}`);
  }
});

test("corporate is read-only on operations but owns inspections and marketing", () => {
  assert.equal(canEdit("temp_sheet", "corporate"), false);
  assert.equal(canEdit("order_sheet", "corporate"), false);
  assert.equal(canView("temp_sheet", "corporate"), true);
  assert.equal(canEdit("corporate_inspection", "corporate"), true);
  assert.equal(canEdit("marketing_material", "corporate"), true);
});

test("designer is marketing-only — no operational or compliance access", () => {
  for (const f of FEATURES) {
    if (f === "marketing_material") {
      assert.equal(canEdit(f, "designer"), true, "designer must edit marketing material");
    } else {
      assert.equal(accessFor(f, "designer"), "none", `designer must have no access to ${f}`);
    }
  }
});

test("group rollup is exclusive to multi-location owner and corporate", () => {
  for (const r of ROLES) {
    const expected = r === "multi_location_owner" || r === "corporate";
    assert.equal(canView("group_rollup", r), expected, `group_rollup view for ${r}`);
  }
});

test("staff can edit only their own food-safety certificate, not others' compliance docs", () => {
  assert.equal(canEdit("staff_food_cert", "staff"), true);
  assert.equal(accessFor("health_safety_license", "staff"), "none");
  assert.equal(accessFor("business_license", "staff"), "none");
});
