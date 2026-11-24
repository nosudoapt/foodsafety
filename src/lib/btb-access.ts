// Canonical BTB feature × role access matrix — the single source of truth for
// which cards appear on the Between the Buns hub and which surfaces are
// read-only per role. Collapsed to BTB's 4 roles (see ./btb-roles). Mirrors the
// FoodSafe-side src/lib/permissions.ts pattern.
//
// Secret-free: imported by client components (the hub, the page wrappers), never
// by ./btb-auth. Relative import only (no "@/") so tests can compile it.
import type { BtbRole } from "./btb-roles";

// Every BTB surface a role can reach. Slugs match /btb/demo/<slug>
// routes (the four reference pages share one "reference" bucket — all-view).
export const BTB_FEATURES = [
  "admin_dashboard",
  "prep_list",
  "checklists",
  "cash_out",
  "staff_schedule",
  "employees",
  "loyalty_rewards",
  "licence_reminders",
  "tax_dates",
  "training_guide",
  "month_end_inventory",
  "branding_requests",
  "order_sheet",
  "cleaning_schedule",
  "temperatures",
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
  // The location platform: per-location shifts, inventory, promotions and
  // compliance. Personal accounts only — the shared workspaces never see it.
  "platform",
] as const;

export type BtbFeature = (typeof BTB_FEATURES)[number];

interface Access {
  view: readonly BtbRole[];
  edit: readonly BtbRole[];
}

// Role groups. "owner" is the new super-admin tier: it sees the whole
// organization but does not inherit legacy store-edit surfaces (those stay
// manager/corporate so legacy accountability is preserved). "designer" is a
// marketing-only personal role and never appears in the shared workspaces.
const ALL: readonly BtbRole[] = ["staff", "supervisor", "manager", "corporate", "owner"]; // admin excluded from normal pages
const BASICS_ALL: readonly BtbRole[] = [...ALL, "designer"]; // reference/safety is readable by every worker
const ADMIN_ONLY: readonly BtbRole[] = ["admin"];
const OPS_EDIT: readonly BtbRole[] = ["staff", "supervisor", "manager"]; // corporate + owner are view-only on operations
const SUP_UP: readonly BtbRole[] = ["supervisor", "manager", "corporate", "owner"]; // supervisor tier and above
const MGR: readonly BtbRole[] = ["manager", "corporate"];             // legacy management (owner is scoped, not legacy)
const MGR_ONLY: readonly BtbRole[] = ["manager"];                     // store-level edit; corporate is oversight-only
const SHIFT_LEADS: readonly BtbRole[] = ["supervisor", "manager"];
const CORP: readonly BtbRole[] = ["corporate", "owner"];               // franchise HQ / super admin
const MARKETING_VIEW: readonly BtbRole[] = ["manager", "designer", "corporate", "owner"];
const MARKETING_EDIT: readonly BtbRole[] = ["manager", "corporate", "owner"]; // designers deliver through the platform workflow
const BRANDING_VIEW: readonly BtbRole[] = ["supervisor", "manager", "designer", "corporate", "owner"];
// The location platform is the personal-account surface. Everyone who works a
// location has it; the shared workspaces (and admin) never appear here.
const PLATFORM: readonly BtbRole[] = ["staff", "supervisor", "manager", "designer", "corporate", "owner"];

// view = who sees the card at all; edit = who can create/edit/delete.
// edit is always a subset of view. Kept explicit so intent is auditable.
export const BTB_MATRIX: Record<BtbFeature, Access> = {
  admin_dashboard:   { view: ADMIN_ONLY, edit: ADMIN_ONLY },
  prep_list:         { view: ALL,    edit: OPS_EDIT },
  // Opening/closing duties — same who as the prep sheet (the checklist used to be a tab on it).
  checklists:        { view: ALL,    edit: OPS_EDIT },
  // End-of-day money: everyone may read the count, only the store manager writes it.
  cash_out:          { view: ALL,    edit: MGR_ONLY },
  // Supervisors and managers coordinate the team and opening/closing coverage.
  staff_schedule:    { view: ALL,    edit: SHIFT_LEADS },
  employees:         { view: SUP_UP, edit: SHIFT_LEADS },
  loyalty_rewards:   { view: ALL,    edit: [] },
  licence_reminders: { view: MGR,    edit: MGR },
  // Deadlines are read-only for the team; managers own the calendar entries.
  tax_dates:         { view: ALL,    edit: MGR_ONLY },
  // SOP library: everyone reads published topics; only managers draft/publish.
  // Owners review Week 4 through the read gate (see the review route), not by
  // gaining store-level edit rights.
  training_guide:    { view: ALL,    edit: MGR_ONLY },
  // Closing counts: everyone reads the sheet, managers type the numbers.
  month_end_inventory: { view: ALL,  edit: MGR_ONLY },
  // Staff are walled out entirely; supervisors read the board and only
  // managers move cards through it or delete them (pinned by tests).
  branding_requests: { view: BRANDING_VIEW, edit: MGR_ONLY }, // staff walled out — marketing board
  order_sheet:       { view: SUP_UP, edit: SHIFT_LEADS },
  cleaning_schedule: { view: ALL,    edit: OPS_EDIT },
  temperatures:      { view: ALL,    edit: OPS_EDIT },
  // Recipe/safety reference is readable by every worker, including designers.
  reference:         { view: BASICS_ALL, edit: [] },
  emergency:         { view: BASICS_ALL, edit: MGR_ONLY },
  protocols:         { view: BASICS_ALL, edit: MGR_ONLY },
  handbook:          { view: BASICS_ALL, edit: MGR_ONLY },
  manuals:           { view: BASICS_ALL, edit: MGR_ONLY },
  compliance:        { view: SUP_UP, edit: MGR_ONLY },
  documents:         { view: SUP_UP, edit: MGR_ONLY },
  staff_licenses:    { view: SUP_UP, edit: MGR_ONLY },
  inspections:       { view: MGR,    edit: MGR },     // manager + corporate; shared InspectionForm
  // The corporate franchise report — HQ only (managers/owners are walled out).
  franchise_inspection: { view: CORP, edit: CORP },
  // Designers review approved briefs here; production happens in the platform
  // marketing workflow, so legacy campaign creation remains a manager action.
  marketing:         { view: MARKETING_VIEW, edit: MARKETING_EDIT },
  // Opening a new location is a corporate decision, not a store one.
  new_restaurant:    { view: CORP, edit: CORP },
  // Vendor/utility logins — legacy store management tier and HQ.
  vault:             { view: MGR, edit: MGR },
  // Location platform. Staff enter their own readings and duties; only the
  // management tier configures templates, equipment, limits and catalogues.
  platform:          { view: PLATFORM, edit: OPS_EDIT },
};

/**
 * The role a session acts with inside a branch.
 *
 * A console (tenant super-admin) that entered the branch works it as that
 * branch's manager for operational actions — schedules, policy, inventory,
 * approvals — while its claims keep `role: owner` so every owner-tier gate and
 * every attribution ("Nitpreet Singh (Owner)") is unchanged.
 */
export function btbAuthority(role: BtbRole, console = false): BtbRole {
  return console ? "manager" : role;
}

/**
 * True if the role can at least see the feature.
 *
 * A `console` is a tenant super-admin that has switched into a branch. Inside
 * that branch it also works it as its manager, so it sees either tier's pages;
 * its own role still decides everything it shows up as (and how it is named in
 * an edit log).
 */
export function btbCanView(feature: BtbFeature, role: BtbRole, console = false): boolean {
  const cell = BTB_MATRIX[feature];
  return cell.view.includes(role) || (console && cell.view.includes("manager"));
}

/**
 * True if the role can create / edit / delete within the feature.
 *
 * Same console rule: entering a branch grants that branch's manager write
 * authority. The owner tier on its own stays view-only on operations.
 */
export function btbCanEdit(feature: BtbFeature, role: BtbRole, console = false): boolean {
  const cell = BTB_MATRIX[feature];
  return cell.edit.includes(role) || (console && cell.edit.includes("manager"));
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
