// Canonical BTB feature × role access matrix — the single source of truth for
// which cards appear on the Between the Buns hub and which surfaces are
// read-only per role. Collapsed to BTB's 4 roles (see ./btb-roles). Mirrors the
// FoodSafe-side src/lib/permissions.ts pattern.
//
// Secret-free: imported by client components (the hub, the page wrappers), never
// by ./btb-auth. Relative import only (no "@/") so tests can compile it.
import { BTB_ROLES, type BtbRole } from "./btb-roles";

// Every BTB surface a role can reach. Slugs match /between-the-buns/<slug>
// routes (the four reference pages share one "reference" bucket — all-view).
export const BTB_FEATURES = [
  "prep_list",
  "order_sheet",
  "cleaning_schedule",
  "reference",        // prep-manual, menu, allergen-chart, gluten-free
  "emergency",
  "protocols",
  "handbook",
  "manuals",
  "compliance",
  "documents",
  "staff_licenses",
  "inspections",
  "franchise_inspection", // corporate franchise audit (corporate + owner)
  "marketing",
  "new_restaurant",
  "vault",
] as const;

export type BtbFeature = (typeof BTB_FEATURES)[number];

interface Access {
  view: readonly BtbRole[];
  edit: readonly BtbRole[];
}

const ALL: readonly BtbRole[] = BTB_ROLES;                            // staff, supervisor, manager, corporate
const OPS_EDIT: readonly BtbRole[] = ["staff", "supervisor", "manager"]; // corporate is view-only on ops
const SUP_UP: readonly BtbRole[] = ["supervisor", "manager", "corporate"]; // supervisor tier and above
const MGR: readonly BtbRole[] = ["manager", "corporate"];             // management (owners are managers here)
const MGR_ONLY: readonly BtbRole[] = ["manager"];                    // store-level edit; corporate is oversight-only
const CORP: readonly BtbRole[] = ["corporate"];                      // franchise HQ only

// view = who sees the card at all; edit = who can create/edit/delete.
// edit is always a subset of view. Kept explicit so intent is auditable.
export const BTB_MATRIX: Record<BtbFeature, Access> = {
  prep_list:         { view: ALL,    edit: OPS_EDIT },
  order_sheet:       { view: SUP_UP, edit: MGR_ONLY }, // supervisor+corporate view; manager edits
  cleaning_schedule: { view: ALL,    edit: OPS_EDIT },
  reference:         { view: ALL,    edit: [] },
  emergency:         { view: ALL,    edit: MGR_ONLY },
  protocols:         { view: ALL,    edit: MGR_ONLY },
  handbook:          { view: ALL,    edit: MGR_ONLY },
  manuals:           { view: ALL,    edit: MGR_ONLY },
  compliance:        { view: SUP_UP, edit: MGR_ONLY },
  documents:         { view: SUP_UP, edit: MGR_ONLY },
  staff_licenses:    { view: SUP_UP, edit: MGR_ONLY },
  inspections:       { view: SUP_UP, edit: MGR },
  // The corporate franchise report — HQ only (managers/owners are walled out).
  franchise_inspection: { view: CORP, edit: CORP },
  marketing:         { view: MGR, edit: MGR },
  // Opening a new location is a corporate decision, not a store one.
  new_restaurant:    { view: CORP, edit: CORP },
  // Vendor/utility logins — store management tier and HQ.
  vault:             { view: MGR, edit: MGR },
};

/** True if the role can at least see the feature. */
export function btbCanView(feature: BtbFeature, role: BtbRole): boolean {
  return BTB_MATRIX[feature].view.includes(role);
}

/** True if the role can create / edit / delete within the feature. */
export function btbCanEdit(feature: BtbFeature, role: BtbRole): boolean {
  return BTB_MATRIX[feature].edit.includes(role);
}

// --- self-check (dev-only, tree-shaken in prod) ---
if (process.env.NODE_ENV !== "production") {
  for (const f of BTB_FEATURES) {
    const cell = BTB_MATRIX[f];
    console.assert(cell, `missing BTB matrix row for ${f}`);
    // edit must be a subset of view.
    for (const r of cell.edit) {
      console.assert(cell.view.includes(r), `${f}: ${r} can edit but not view`);
    }
  }
}
