// Canonical feature × role access matrix — the single source of truth for
// "who can do what" across the FoodSafe surface. Route gating (route-guards.ts),
// admin nav (admin/layout.tsx) and the role-conditional dashboard all describe
// slices of this; this file is the authoritative, documented whole.
//
// Roles come from roles.ts (never invent one here). Access levels:
//   "edit"   — create / edit / delete
//   "view"   — read only
//   "notify" — read only + receives expiry / alert notifications
//   "none"   — no access
//
// Relative import only (no "@/") so tests/*.test.ts can compile this file.
import { ROLES, type Role } from "./roles";

export type Access = "edit" | "view" | "notify" | "none";

/** Every trackable feature in the product, grouped by module. */
export const FEATURES = [
  // Module 1 — Daily Operations
  "prep_count",
  "order_sheet",
  "temp_sheet",
  "cleaning_schedule",
  "cheat_sheet",
  // Module 2 — Documents & Compliance (upload + expiry + notify)
  "health_safety_license",
  "business_license",
  "business_insurance",
  "pest_control_report",
  "hoods_inspection",
  "fire_suppression",
  "staff_food_cert",
  // Module 3 — Legal Agreements
  "franchise_agreement",
  "lease_agreement",
  // Module 4 — Vault & Emergency Reference
  "login_vault",
  "emergency_contacts",
  "protocols",
  // Module 5 — People & Training
  "user_management",
  "training_module",
  "employee_handbook",
  "print_materials",
  // Module 6 — Marketing
  "marketing_material",
  "promo_request",
  // Module 7 — Corporate Oversight & Expansion
  "corporate_inspection",
  "group_rollup",
  "new_restaurant",
] as const;

export type Feature = (typeof FEATURES)[number];

// Access matrix. Read as MATRIX[feature][role]. Kept explicit (no clever
// defaulting) so the food-safety intent of each cell is auditable at a glance.
export const MATRIX: Record<Feature, Record<Role, Access>> = {
  // Module 1 — Daily Operations
  prep_count:            { staff: "edit", manager: "edit", owner: "edit", multi_location_owner: "view", corporate: "view", designer: "none" },
  order_sheet:           { staff: "edit", manager: "edit", owner: "edit", multi_location_owner: "view", corporate: "view", designer: "none" },
  temp_sheet:            { staff: "edit", manager: "edit", owner: "edit", multi_location_owner: "view", corporate: "view", designer: "none" },
  cleaning_schedule:     { staff: "edit", manager: "edit", owner: "edit", multi_location_owner: "view", corporate: "view", designer: "none" },
  cheat_sheet:           { staff: "view", manager: "view", owner: "view", multi_location_owner: "view", corporate: "view", designer: "none" },
  // Module 2 — Documents & Compliance
  health_safety_license: { staff: "none", manager: "notify", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  business_license:      { staff: "none", manager: "view", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  business_insurance:    { staff: "none", manager: "view", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  pest_control_report:   { staff: "none", manager: "notify", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  hoods_inspection:      { staff: "none", manager: "notify", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  fire_suppression:      { staff: "none", manager: "notify", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  staff_food_cert:       { staff: "edit", manager: "notify", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  // Module 3 — Legal Agreements
  franchise_agreement:   { staff: "none", manager: "none", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  lease_agreement:       { staff: "none", manager: "none", owner: "notify", multi_location_owner: "notify", corporate: "notify", designer: "none" },
  // Module 4 — Vault & Emergency Reference
  login_vault:           { staff: "none", manager: "view", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  emergency_contacts:    { staff: "view", manager: "edit", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  protocols:             { staff: "view", manager: "edit", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  // Module 5 — People & Training
  user_management:       { staff: "none", manager: "view", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  training_module:       { staff: "view", manager: "edit", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  employee_handbook:     { staff: "view", manager: "edit", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  print_materials:       { staff: "view", manager: "edit", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  // Module 6 — Marketing
  marketing_material:    { staff: "view", manager: "view", owner: "view", multi_location_owner: "view", corporate: "edit", designer: "edit" },
  promo_request:         { staff: "none", manager: "edit", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
  // Module 7 — Corporate Oversight & Expansion
  corporate_inspection:  { staff: "none", manager: "view", owner: "view", multi_location_owner: "view", corporate: "edit", designer: "none" },
  group_rollup:          { staff: "none", manager: "none", owner: "none", multi_location_owner: "view", corporate: "view", designer: "none" },
  new_restaurant:        { staff: "none", manager: "none", owner: "edit", multi_location_owner: "edit", corporate: "view", designer: "none" },
};

/** Access level a role has for a feature. */
export function accessFor(feature: Feature, role: Role): Access {
  return MATRIX[feature][role];
}

/** True if the role can at least see the feature (view / notify / edit). */
export function canView(feature: Feature, role: Role): boolean {
  return accessFor(feature, role) !== "none";
}

/** True if the role can create / edit the feature. */
export function canEdit(feature: Feature, role: Role): boolean {
  return accessFor(feature, role) === "edit";
}

// --- self-check (dev-only, tree-shaken in prod) ---
if (process.env.NODE_ENV !== "production") {
  for (const f of FEATURES) {
    console.assert(MATRIX[f], `missing matrix row for ${f}`);
    for (const r of ROLES) {
      console.assert(MATRIX[f][r] !== undefined, `missing ${f} × ${r}`);
    }
  }
}
