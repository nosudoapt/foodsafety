import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  MGMT_ROLES,
  OWNER_TIER_ROLES,
  OPERATIONAL_ROLES,
  MARKETING_ROLES,
  DEFAULT_ROLE,
  isRole,
  roleLabel,
  roleColor,
} from "../src/lib/roles";

test("exactly six roles and no dropped 'supervisor'", () => {
  assert.equal(ROLES.length, 6);
  assert.deepEqual(
    [...ROLES],
    ["staff", "manager", "owner", "multi_location_owner", "corporate", "designer"]
  );
  assert.ok(!isRole("supervisor"));
});

test("management tier is the superset of the owner tier", () => {
  for (const role of OWNER_TIER_ROLES) {
    assert.ok(MGMT_ROLES.includes(role), `${role} should be in MGMT_ROLES`);
    assert.ok(isRole(role));
  }
  assert.ok(MGMT_ROLES.includes("manager"));
  assert.ok(!OWNER_TIER_ROLES.includes("manager"));
  assert.equal(MGMT_ROLES.length, 4);
});

test("every tier role exists in ROLES", () => {
  for (const role of [...MGMT_ROLES, ...ROLES]) {
    assert.ok((ROLES as readonly string[]).includes(role), `${role} missing`);
  }
});

test("default role is staff and is a real role", () => {
  assert.equal(DEFAULT_ROLE, "staff");
  assert.ok(isRole(DEFAULT_ROLE));
  assert.ok(!MGMT_ROLES.includes(DEFAULT_ROLE));
});

test("labels and colors cover every role, unknown falls back", () => {
  for (const role of ROLES) {
    assert.ok(roleLabel(role));
    assert.ok(roleColor(role));
  }
  assert.equal(roleLabel("nonsense"), "nonsense");
  assert.equal(roleColor("nonsense"), "bg-gray-100 text-gray-700");
});

test("designer is marketing-only — never an operational or admin tier", () => {
  assert.equal(OPERATIONAL_ROLES.includes("designer"), false);
  assert.equal(OPERATIONAL_ROLES.length, ROLES.length - 1);
  assert.deepEqual([...OPERATIONAL_ROLES], ["staff", "manager", "owner", "multi_location_owner", "corporate"]);

  assert.ok(MARKETING_ROLES.includes("designer"));
  assert.equal(MARKETING_ROLES.length, MGMT_ROLES.length + 1);
  for (const role of MGMT_ROLES) assert.ok(MARKETING_ROLES.includes(role));
});
