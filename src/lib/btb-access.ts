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
  "prep_count",
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

const ALL: readonly BtbRole[] = BTB_ROLES;                       // staff, manager, owner, corporate
const MGMT: readonly BtbRole[] = ["manager", "owner", "corporate"];
const OPS_EDIT: readonly BtbRole[] = ["staff", "manager", "owner"]; // corporate is view-only on ops
const MGR_OWNER: readonly BtbRole[] = ["manager", "owner"];

// view = who sees the card at all; edit = who can create/edit/delete.
// edit is always a subset of view. Kept explicit so intent is auditable.
export const BTB_MATRIX: Record<BtbFeature, Access> = {
  prep_count:        { view: ALL,  edit: OPS_EDIT },
  prep_list:         { view: ALL,  edit: OPS_EDIT },
  order_sheet:       { view: MGMT, edit: MGR_OWNER },
  cleaning_schedule: { view: ALL,  edit: OPS_EDIT },
  reference:         { view: ALL,  edit: [] },
  emergency:         { view: ALL,  edit: MGR_OWNER },
  protocols:         { view: ALL,  edit: MGR_OWNER },
  handbook:          { view: ALL,  edit: MGR_OWNER },
  manuals:           { view: ALL,  edit: MGR_OWNER },
  compliance:        { view: MGMT, edit: MGR_OWNER },
  documents:         { view: MGMT, edit: MGR_OWNER },
  staff_licenses:    { view: MGMT, edit: MGR_OWNER },
  inspections:       { view: MGMT, edit: ["manager", "owner", "corporate"] },
  franchise_inspection: { view: ["corporate", "owner"], edit: ["corporate", "owner"] },
  marketing:         { view: ["owner", "corporate"], edit: ["owner", "corporate"] },
  new_restaurant:    { view: ["owner", "corporate"], edit: ["owner"] },
  vault:             { view: ["owner"], edit: ["owner"] },
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
