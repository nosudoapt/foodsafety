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
  assert.equal(btbCanView("prep_list", "corporate"), true);
  assert.equal(btbCanEdit("prep_list", "corporate"), false);
  assert.equal(btbCanEdit("cleaning_schedule", "corporate"), false);
  assert.equal(btbCanEdit("order_sheet", "corporate"), false);
  assert.equal(btbCanView("compliance", "corporate"), true);
  assert.equal(btbCanEdit("compliance", "corporate"), false);
  assert.equal(btbCanEdit("inspections", "corporate"), true);
});

test("the login vault is management-tier (manager + corporate), view == edit", () => {
  for (const r of BTB_ROLES) {
    const expected = r === "manager" || r === "corporate";
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

test("new-restaurant and the corporate report are HQ-only", () => {
  for (const f of ["new_restaurant", "franchise_inspection"] as const) {
    assert.equal(btbCanView(f, "corporate"), true, `corporate views ${f}`);
    assert.equal(btbCanEdit(f, "corporate"), true, `corporate edits ${f}`);
    assert.equal(btbCanView(f, "manager"), false, `manager must not view ${f}`);
    assert.equal(btbCanView(f, "supervisor"), false, `supervisor must not view ${f}`);
    assert.equal(btbCanView(f, "staff"), false, `staff must not view ${f}`);
  }
});

test("the manager tier edits the shared compliance/admin surfaces; staff & supervisor cannot", () => {
  const surfaces = ["compliance", "documents", "staff_licenses", "emergency", "protocols", "handbook", "manuals"] as const;
  for (const f of surfaces) {
    assert.equal(btbCanEdit(f, "manager"), true, `manager edit ${f}`);
    assert.equal(btbCanEdit(f, "staff"), false, `staff edit ${f}`);
    assert.equal(btbCanEdit(f, "supervisor"), false, `supervisor edit ${f}`);
  }
});

test("supervisor sits between staff and manager", () => {
  // Sees the management operational surfaces (view), but cannot edit them…
  for (const f of ["order_sheet", "compliance", "documents", "staff_licenses"] as const) {
    assert.equal(btbCanView(f, "supervisor"), true, `supervisor views ${f}`);
    assert.equal(btbCanEdit(f, "supervisor"), false, `supervisor must not edit ${f}`);
  }
  // …and is walled from the owner/HQ-only surfaces entirely.
  for (const f of ["vault", "marketing", "new_restaurant", "franchise_inspection"] as const) {
    assert.equal(btbCanView(f, "supervisor"), false, `supervisor must not view ${f}`);
  }
  // Still does the shop-floor edits staff do.
  for (const f of ["prep_list", "cleaning_schedule"] as const) {
    assert.equal(btbCanEdit(f, "supervisor"), true, `supervisor edits ${f}`);
  }
});

test("in-house inspections are manager-tier (manager + corporate only)", () => {
  for (const r of BTB_ROLES) {
    const expected = r === "manager" || r === "corporate";
    assert.equal(btbCanView("inspections", r), expected, `inspections view for ${r}`);
    assert.equal(btbCanEdit("inspections", r), expected, `inspections edit for ${r}`);
  }
});

// --- route coverage -------------------------------------------------------
// The matrix is only worth something if each route actually uses it. This
// guards against a page shipping without the gate — staff could deep-link
// straight into MGMT-only surfaces (the hub hides the card, not the URL).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTE_FEATURE: Record<string, string> = {
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
