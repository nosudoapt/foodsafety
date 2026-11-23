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

test("reference pages are all-view, no-edit — except admin, which is walled out", () => {
  for (const r of BTB_ROLES) {
    if (r === "admin") {
      // Admin is restricted to the admin dashboard only (commit b8ce4e2).
      assert.equal(btbCanView("reference", r), false, `admin must not view reference`);
      continue;
    }
    assert.equal(btbCanView("reference", r), true, `reference view for ${r}`);
    assert.equal(btbCanEdit("reference", r), false, `reference edit for ${r}`);
  }
});

test("personal designer role reads recipes but never writes them", () => {
  // Missing this row made the shared hub render a broken reference tile and
  // let the designer role disappear from the access matrix entirely.
  assert.equal(btbCanView("reference", "designer"), true);
  assert.equal(btbCanEdit("reference", "designer"), false);
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
  for (const f of ["compliance", "documents", "staff_licenses"] as const) {
    assert.equal(btbCanView(f, "supervisor"), true, `supervisor views ${f}`);
    assert.equal(btbCanEdit(f, "supervisor"), false, `supervisor must not edit ${f}`);
  }
  // …and is walled from the owner/HQ-only surfaces entirely.
  for (const f of ["vault", "marketing", "new_restaurant", "franchise_inspection"] as const) {
    assert.equal(btbCanView(f, "supervisor"), false, `supervisor must not view ${f}`);
  }
  // Still does the shop-floor edits staff do.
  for (const f of ["prep_list", "cleaning_schedule", "employees", "staff_schedule", "order_sheet"] as const) {
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

test("staff cannot reach branding requests; supervisors view, managers edit; admin walled out", () => {
  for (const r of BTB_ROLES) {
    if (r === "admin") {
      // Admin sees only the admin dashboard, not operational surfaces.
      assert.equal(btbCanView("branding_requests", r), false, `branding view for ${r}`);
      assert.equal(btbCanEdit("branding_requests", r), false, `branding edit for ${r}`);
      continue;
    }
    const canView = r !== "staff";
    const canEdit = r === "manager";
    assert.equal(btbCanView("branding_requests", r), canView, `branding view for ${r}`);
    assert.equal(btbCanEdit("branding_requests", r), canEdit, `branding edit for ${r}`);
  }
});

// --- route coverage -------------------------------------------------------
// The matrix is only worth something if each route actually uses it. This
// guards against a page shipping without the gate — staff could deep-link
// straight into MGMT-only surfaces (the hub hides the card, not the URL).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTE_FEATURE: Record<string, string> = {
  admin: "admin_dashboard",
  "prep-list": "prep_list",
  checklists: "checklists",
  "cash-out": "cash_out",
  "staff-schedule": "staff_schedule",
  employees: "employees",
  "loyalty-rewards": "loyalty_rewards",
  "licence-reminders": "licence_reminders",
  "tax-dates": "tax_dates",
  "training-guide": "training_guide",
  "month-end-inventory": "month_end_inventory",
  "branding-requests": "branding_requests",
  "order-sheet": "order_sheet",
  "cleaning-schedule": "cleaning_schedule",
  temperatures: "temperatures",
  compliance: "compliance",
  documents: "documents",
  "staff-licenses": "staff_licenses",
  inspections: "inspections",
  "franchise-inspection": "franchise_inspection",
  marketing: "marketing",
  "new-restaurant": "new_restaurant",
  vault: "vault",
  // The personal-account location workspace. Never shown to shared accounts.
  platform: "platform",
  emergency: "emergency",
  protocols: "protocols",
  handbook: "handbook",
  manuals: "manuals",
};

const SERVER_GATED_CLIENT_ISLANDS = new Set(["prep-list"]);

// Views that no longer touch PostgREST at all: every read and write goes
// through their server endpoint, which resolves the branch from the session.
const SERVER_API_VIEWS: Record<string, string> = {
  "cleaning-schedule": "/api/btb/cleaning",
  "cash-out": "/api/btb/cash-out",
};

test("cleaning schedule and cash-out are server-backed: no browser table access at all", () => {
  const root = join(__dirname, "..", "..", "src", "app", "btb/demo");
  for (const [slug, endpoint] of Object.entries(SERVER_API_VIEWS)) {
    const source = readFileSync(join(root, slug, "view.tsx"), "utf8");
    assert.ok(source.includes(endpoint), `/${slug} must read and write through ${endpoint}`);
    assert.ok(!source.includes('from "@/lib/supabase"'), `/${slug} must not import the browser Supabase client`);
    assert.ok(!/\.from\("(cleaning_logs|cash_outs)"\)/.test(source), `/${slug} must not name a table directly`);
    // The feature gate still decides read-only (corporate/owner are view-only).
    assert.match(source, /BtbFeatureGate/);
  }
});

const SERVER_ONLY_GATED_ROUTES = new Set([
  "account",
  "menu",
  "allergen-chart",
  "gluten-free",
  "prep-manual",
  "fryer-timing",
]);

test("interactive BTB views preserve their existing feature gates", () => {
  const root = join(__dirname, "..", "..", "src", "app", "btb/demo");
  const slugs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const slug of slugs) {
    const feature = ROUTE_FEATURE[slug];
    if (!feature) {
      assert.ok(
        SERVER_ONLY_GATED_ROUTES.has(slug),
        `route "/btb/demo/${slug}" maps to no feature — add its client gate or explicitly audit its server-only gate`,
      );
      continue;
    }
    // The prep sheet became a server-backed client island: its authorization is
    // the awaited BtbServerPage boundary (asserted below for every leaf), and its
    // data calls run through /api/btb/prep rather than browser tables. It is
    // audited here instead of carrying a second, client-side gate.
    if (SERVER_GATED_CLIENT_ISLANDS.has(slug)) {
      const page = readFileSync(join(root, slug, "page.tsx"), "utf8");
      assert.ok(page.includes(`page: "${slug}"`), `${slug}/page.tsx must await its server boundary`);
      const island = readFileSync(join(root, slug, "prep-sheet.tsx"), "utf8");
      assert.ok(island.includes("/api/btb/prep"), `${slug} must read through its server API`);
      assert.ok(!island.includes('from "@/lib/supabase"'), `${slug} must not write browser tables`);
      continue;
    }
    const source = readFileSync(join(root, slug, "view.tsx"), "utf8");
    assert.match(source, /BtbFeatureGate/, `${slug}/view.tsx must wrap its content in BtbFeatureGate`);
    assert.ok(
      source.includes(`feature="${feature}"`),
      `${slug}/view.tsx must gate feature "${feature}"`,
    );
  }
});

test("all 37 BTB leaves await their exact server gate, including references, account and platform children", () => {
  const root = join(__dirname, "..", "..", "src", "app", "btb/demo");
  const pages = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(file => file === "page.tsx" || file.endsWith("/page.tsx"));
  assert.equal(pages.length, 37);
  for (const file of pages) {
    const slug = file === "page.tsx" ? "" : file.slice(0, -"/page.tsx".length);
    const source = readFileSync(join(root, file), "utf8");
    assert.ok(!source.includes('"use client"'), `${file} is a server entry, not a client-only gate`);
    assert.match(source, /export default async function/, `${file} awaits authorization before returning content`);
    assert.ok(source.includes(`return await BtbServerPage({ page: "${slug}"`), `${file} must await its exact server boundary`);
  }
  const boundary = readFileSync(join(root, "../../../components/btb/BtbServerPage.tsx"), "utf8");
  assert.ok(boundary.includes("await requireBtbAccess("));
  assert.ok(boundary.indexOf("if (failure) return") < boundary.indexOf("return <>{children}</>"), "denied/failed access cannot serialize protected children");
  assert.ok(boundary.indexOf("if (failure?.status === 401) redirect") > boundary.indexOf("} catch (error)"), "Next redirects stay outside the authorization catch");
});
