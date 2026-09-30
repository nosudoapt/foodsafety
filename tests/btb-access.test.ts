import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BTB_FEATURES,
  BTB_MATRIX,
  btbCanView,
  btbCanEdit,
} from "../src/lib/btb-access";
import { BTB_ROLES } from "../src/lib/btb-roles";

test("every feature has a valid row and no orphans", () => {
  assert.equal(Object.keys(BTB_MATRIX).length, BTB_FEATURES.length);
  for (const f of BTB_FEATURES) {
    assert.ok(BTB_MATRIX[f], `missing row for ${f}`);
    assert.ok(Array.isArray(BTB_MATRIX[f].view), `${f} view must be an array`);
    assert.ok(Array.isArray(BTB_MATRIX[f].edit), `${f} edit must be an array`);
  }
});

test("edit is always a subset of view", () => {
  for (const f of BTB_FEATURES) {
    for (const r of BTB_MATRIX[f].edit) {
      assert.ok(
        BTB_MATRIX[f].view.includes(r),
        `${f}: ${r} can edit but not view`,
      );
    }
  }
});

test("only valid BTB roles appear in the matrix", () => {
  for (const f of BTB_FEATURES) {
    for (const r of [...BTB_MATRIX[f].view, ...BTB_MATRIX[f].edit]) {
      assert.ok(BTB_ROLES.includes(r), `${f}: ${r} is not a BTB role`);
    }
  }
});

test("staff is walled from vault, compliance, documents, staff-licenses, order-sheet, marketing", () => {
  const walled = [
    "vault",
    "compliance",
    "documents",
    "staff_licenses",
    "order_sheet",
    "marketing",
    "new_restaurant",
    "inspections",
  ] as const;
  for (const f of walled) {
    assert.equal(btbCanView(f, "staff"), false, `staff must not view ${f}`);
  }
});

test("corporate is view-only on operations but can edit inspections", () => {
  assert.equal(btbCanView("prep_count", "corporate"), true);
  assert.equal(btbCanEdit("prep_count", "corporate"), false);
  assert.equal(btbCanEdit("cleaning_schedule", "corporate"), false);
  assert.equal(btbCanEdit("order_sheet", "corporate"), false);
  assert.equal(btbCanView("compliance", "corporate"), true);
  assert.equal(btbCanEdit("compliance", "corporate"), false);
  assert.equal(btbCanEdit("inspections", "corporate"), true);
});

test("the login vault is owner-only for both view and edit", () => {
  for (const r of BTB_ROLES) {
    const expected = r === "owner";
    assert.equal(btbCanView("vault", r), expected, `vault view for ${r}`);
    assert.equal(btbCanEdit("vault", r), expected, `vault edit for ${r}`);
  }
});

test("reference pages are all-view, no-edit", () => {
  for (const r of BTB_ROLES) {
    assert.equal(btbCanView("reference", r), true, `reference view for ${r}`);
    assert.equal(btbCanEdit("reference", r), false, `reference edit for ${r}`);
  }
});

test("only owner can edit new-restaurant; corporate views it", () => {
  assert.equal(btbCanEdit("new_restaurant", "owner"), true);
  assert.equal(btbCanEdit("new_restaurant", "corporate"), false);
  assert.equal(btbCanView("new_restaurant", "corporate"), true);
  assert.equal(btbCanView("new_restaurant", "staff"), false);
});

test("managers and owners edit the shared compliance/admin surfaces", () => {
  const surfaces = ["compliance", "documents", "staff_licenses", "emergency", "protocols", "handbook", "manuals"] as const;
  for (const f of surfaces) {
    assert.equal(btbCanEdit(f, "manager"), true, `manager edit ${f}`);
    assert.equal(btbCanEdit(f, "owner"), true, `owner edit ${f}`);
    assert.equal(btbCanEdit(f, "staff"), false, `staff edit ${f}`);
  }
});

// --- route coverage -------------------------------------------------------
// The matrix is only worth something if each route actually uses it. This
// guards against a page shipping without the gate — staff could deep-link
// straight into MGMT-only surfaces (the hub hides the card, not the URL).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTE_FEATURE: Record<string, string> = {
  "prep-count": "prep_count",
  "prep-list": "prep_list",
  "order-sheet": "order_sheet",
  "cleaning-schedule": "cleaning_schedule",
  compliance: "compliance",
  documents: "documents",
  "staff-licenses": "staff_licenses",
  inspections: "inspections",
  "franchise-inspection": "franchise_inspection",
  marketing: "marketing",
  "new-restaurant": "new_restaurant",
  vault: "vault",
  emergency: "emergency",
  protocols: "protocols",
  handbook: "handbook",
  manuals: "manuals",
};

// Reference pages are all-view / no-edit for every role, so the gate would add
// nothing; login is the auth screen itself.
const UNGATED_ROUTES = new Set([
  "login",
  "menu",
  "allergen-chart",
  "gluten-free",
  "prep-manual",
]);

test("every BTB route is either gated by its feature or explicitly ungated", () => {
  const root = join(__dirname, "..", "..", "src", "app", "between-the-buns");
  const slugs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const slug of slugs) {
    const feature = ROUTE_FEATURE[slug];
    if (!feature) {
      assert.ok(
        UNGATED_ROUTES.has(slug),
        `route "/between-the-buns/${slug}" maps to no feature — add it to ROUTE_FEATURE (with a btb-access row) or to UNGATED_ROUTES`,
      );
      continue;
    }
    const source = readFileSync(join(root, slug, "page.tsx"), "utf8");
    assert.match(source, /BtbFeatureGate/, `${slug}/page.tsx must wrap its content in BtbFeatureGate`);
    assert.ok(
      source.includes(`feature="${feature}"`),
      `${slug}/page.tsx must gate feature "${feature}"`,
    );
  }
});
