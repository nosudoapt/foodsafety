// The Between the Buns hub's cards and which roles may see each one.
// Plain data (no icons/JSX) so tests can assert the role split directly.
// Icons are resolved in src/app/btb/demo/hub.tsx.
// Imports ./btb-roles + ./btb-access (both secret-free), never ./btb-auth —
// this reaches the client. Card visibility is derived from the single source of
// truth in ./btb-access (btbCanView), so the hub and the pages never disagree.
import { type BtbRole } from "./btb-roles";
import { btbCanView, type BtbFeature } from "./btb-access";

export type BtbIconKey =
  | "calculator"
  | "layoutGrid"
  | "clipboard"
  | "sparkles"
  | "book"
  | "utensils"
  | "alert"
  | "salad"
  | "phone"
  | "fileText"
  | "bookCheck"
  | "printer"
  | "shield"
  | "file"
  | "idCard"
  | "clipboardCheck"
  | "megaphone"
  | "listChecks"
  | "flame"
  | "thermometer"
  | "key";

export interface BtbCard {
  href: string;
  title: string;
  desc: string;
  iconKey: BtbIconKey;
  accent: "red" | "amber" | "purple" | "green";
  /** The access-matrix feature this card maps to (drives visibility). */
  feature: BtbFeature;
  /** false = route reachable but not a hub tile (it lives in a combined card). */
  hub?: boolean;
}

// One card per hub tile. Visibility is derived from btb-access (btbCanView),
// so there is no second place to keep in sync. Ordered operational → reference
// → management.
export const BTB_CARDS: readonly BtbCard[] = [
  { href: "/btb/demo/admin", title: "Admin Dashboard", desc: "Assign page access per role.", iconKey: "layoutGrid", accent: "red", feature: "admin_dashboard" },
  { href: "/btb/demo/platform", title: "Location Workspace", desc: "Per-location operations, inventory, marketing and compliance.", iconKey: "layoutGrid", accent: "purple", feature: "platform" },
  { href: "/btb/demo/prep-list", title: "Daily Prep Sheet", desc: "3-section sheet — Produce, Sauces, Freezer. Par/OH/Make boxes.", iconKey: "layoutGrid", accent: "red", feature: "prep_list" },
  { href: "/btb/demo/checklists", title: "Opening & Closing", desc: "Open/close duties — Front & Kitchen, ticked per shift.", iconKey: "listChecks", accent: "amber", feature: "checklists" },
  { href: "/btb/demo/branding-requests", title: "Branding Requests", desc: "Signage, menus and T-shirts in sizes S–XXXL.", iconKey: "sparkles", accent: "amber", feature: "branding_requests" },
  { href: "/btb/demo/month-end-inventory", title: "Month-End Inventory", desc: "Closing count sheet — value, variance vs last month.", iconKey: "listChecks", accent: "green", feature: "month_end_inventory" },
  { href: "/btb/demo/training-guide", title: "Training & Progress", desc: "Learn the routines, submit your training and track manager approvals.", iconKey: "bookCheck", accent: "purple", feature: "training_guide" },
  { href: "/btb/demo/loyalty-rewards", title: "Loyalty Rewards", desc: "Employee and customer guides, rewards, eligibility and MYR redemption.", iconKey: "sparkles", accent: "purple", feature: "loyalty_rewards" },
  { href: "/btb/demo/tax-dates", title: "Tax & Renewal Dates", desc: "GST/PST returns, registry renewals, year-end filings — one list.", iconKey: "clipboard", accent: "amber", feature: "tax_dates", hub: false },
  { href: "/btb/demo/staff-schedule", title: "Staff Schedule", desc: "Weekly shifts with named opening and closing staff.", iconKey: "idCard", accent: "purple", feature: "staff_schedule" },
  { href: "/btb/demo/employees", title: "Employees", desc: "Individual logins, phone numbers, emails and team records.", iconKey: "idCard", accent: "purple", feature: "employees" },
  { href: "/btb/demo/cash-out", title: "Cash Out", desc: "End-of-day till count, safe drop & 30-day history.", iconKey: "calculator", accent: "green", feature: "cash_out" },
  { href: "/btb/demo/order-sheet", title: "Order Sheet", desc: "PAR, on-hand counts, previous orders and a permanent order history.", iconKey: "clipboard", accent: "amber", feature: "order_sheet" },
  { href: "/btb/demo/cleaning-schedule", title: "Cleaning Schedule", desc: "Weekly tasks with before & after photo upload.", iconKey: "sparkles", accent: "purple", feature: "cleaning_schedule" },
  { href: "/btb/demo/temperatures", title: "Temperature Log", desc: "Temperature sheet for food, fridges and freezers, with 90-day history.", iconKey: "thermometer", accent: "green", feature: "temperatures" },
  { href: "/btb/demo/prep-manual", title: "Prep Manual", desc: "Searchable recipes & prep guides — 21 recipes.", iconKey: "book", accent: "red", feature: "reference" },
  { href: "/btb/demo/menu", title: "Recipe Cheat Sheets", desc: "Burgers, wraps, salads, smoothies & shakes.", iconKey: "utensils", accent: "amber", feature: "reference" },
  { href: "/btb/demo/allergen-chart", title: "Bun Allergy Chart", desc: "Allergen info for all bun types.", iconKey: "alert", accent: "amber", feature: "reference" },
  { href: "/btb/demo/gluten-free", title: "Gluten Free Menu", desc: "Safe options for gluten-free & Celiac guests.", iconKey: "salad", accent: "green", feature: "reference" },
  { href: "/btb/demo/fryer-timing", title: "Fryer Timing & Portions", desc: "Cook times & portion sizes for every fryer item.", iconKey: "flame", accent: "red", feature: "reference" },
  // Reference & safety (all roles)
  { href: "/btb/demo/emergency", title: "Emergency Contacts", desc: "Priority-ordered numbers — tap to call.", iconKey: "phone", accent: "red", feature: "emergency" },
  { href: "/btb/demo/protocols", title: "Operational Protocols", desc: "Step-by-step procedures for the whole team.", iconKey: "fileText", accent: "purple", feature: "protocols" },
  { href: "/btb/demo/handbook", title: "Employee Handbook", desc: "Policies & e-signature acknowledgement.", iconKey: "bookCheck", accent: "red", feature: "handbook" },
  { href: "/btb/demo/manuals", title: "Print & Procedure Manuals", desc: "Downloadable manuals by category.", iconKey: "printer", accent: "amber", feature: "manuals" },
  // Compliance & administration (management) — ONE card for the whole
  // compliance family. The sibling routes still exist (and keep their page
  // access rules), they are sections inside /compliance, not hub cards.
  { href: "/btb/demo/compliance", title: "Compliance", desc: "Licences & renewals, staff certificates, tax deadlines, business documents and reminder emails — one place.", iconKey: "shield", accent: "red", feature: "compliance" },
  { href: "/btb/demo/documents", title: "Business Documents", desc: "Forms, SOPs, brand assets & menus — plain files, no expiry.", iconKey: "file", accent: "amber", feature: "documents", hub: false },
  { href: "/btb/demo/staff-licenses", title: "Staff Licenses & Certs", desc: "Food-handler cards & certifications with expiry.", iconKey: "idCard", accent: "purple", feature: "staff_licenses", hub: false },
  { href: "/btb/demo/licence-reminders", title: "Licence Email Reminders", desc: "Expiry emails to managers and corporate, with delivery history.", iconKey: "shield", accent: "amber", feature: "licence_reminders", hub: false },
  { href: "/btb/demo/inspections", title: "In-House Inspections", desc: "Self-audit checklists with scoring & history.", iconKey: "clipboardCheck", accent: "green", feature: "inspections" },
  { href: "/btb/demo/franchise-inspection", title: "Franchise Inspection", desc: "Weighted rubric — scoring, photo proofs & history.", iconKey: "clipboardCheck", accent: "red", feature: "franchise_inspection" },
  { href: "/btb/demo/marketing", title: "Marketing", desc: "Promotions & the social media calendar.", iconKey: "megaphone", accent: "amber", feature: "marketing" },
  { href: "/btb/demo/new-restaurant", title: "Franchise Opening Checklist", desc: "All 16 launch sections, from franchise setup through grand opening.", iconKey: "listChecks", accent: "purple", feature: "new_restaurant" },
  { href: "/btb/demo/vault", title: "Login Vault", desc: "Encrypted credentials for vendor & utility logins.", iconKey: "key", accent: "red", feature: "vault" },
];

export function cardsForRole(role: string): BtbCard[] {
  return BTB_CARDS.filter((card) => card.hub !== false && btbCanView(card.feature, role as BtbRole));
}

/** Cards this role cannot see — used to explain the gap instead of hiding it silently.
 * Non-hub routes (sections of a combined card) are excluded: they aren't gaps. */
export function hiddenCardsForRole(role: string): BtbCard[] {
  return BTB_CARDS.filter((card) => card.hub !== false && !btbCanView(card.feature, role as BtbRole));
}
