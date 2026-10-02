// The Between the Buns hub's cards and which roles may see each one.
// Plain data (no icons/JSX) so tests can assert the role split directly.
// Icons are resolved in src/app/between-the-buns/hub.tsx.
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
  | "key";

export interface BtbCard {
  href: string;
  title: string;
  desc: string;
  iconKey: BtbIconKey;
  accent: "red" | "amber" | "purple" | "green";
  /** The access-matrix feature this card maps to (drives visibility). */
  feature: BtbFeature;
}

// One card per hub tile. Visibility is derived from btb-access (btbCanView),
// so there is no second place to keep in sync. Ordered operational → reference
// → management.
export const BTB_CARDS: readonly BtbCard[] = [
  { href: "/between-the-buns/prep-list", title: "Daily Prep Sheet", desc: "3-section sheet — Produce, Sauces, Freezer. Par/OH/Make boxes.", iconKey: "layoutGrid", accent: "red", feature: "prep_list" },
  { href: "/between-the-buns/cash-out", title: "Cash Out", desc: "End-of-day till count, safe drop & 30-day history.", iconKey: "calculator", accent: "green", feature: "cash_out" },
  { href: "/between-the-buns/order-sheet", title: "Order Sheet", desc: "ORDER = PAR − On Hand. Keeps 3 months of orders.", iconKey: "clipboard", accent: "amber", feature: "order_sheet" },
  { href: "/between-the-buns/cleaning-schedule", title: "Cleaning Schedule", desc: "Weekly tasks with before & after photo upload.", iconKey: "sparkles", accent: "purple", feature: "cleaning_schedule" },
  { href: "/between-the-buns/prep-manual", title: "Prep Manual", desc: "Searchable recipes & prep guides — 21 recipes.", iconKey: "book", accent: "red", feature: "reference" },
  { href: "/between-the-buns/menu", title: "Recipe Cheat Sheets", desc: "Burgers, wraps, salads, smoothies & shakes.", iconKey: "utensils", accent: "amber", feature: "reference" },
  { href: "/between-the-buns/allergen-chart", title: "Bun Allergy Chart", desc: "Allergen info for all bun types.", iconKey: "alert", accent: "amber", feature: "reference" },
  { href: "/between-the-buns/gluten-free", title: "Gluten Free Menu", desc: "Safe options for gluten-free & Celiac guests.", iconKey: "salad", accent: "green", feature: "reference" },
  // Reference & safety (all roles)
  { href: "/between-the-buns/emergency", title: "Emergency Contacts", desc: "Priority-ordered numbers — tap to call.", iconKey: "phone", accent: "red", feature: "emergency" },
  { href: "/between-the-buns/protocols", title: "Operational Protocols", desc: "Step-by-step procedures for the whole team.", iconKey: "fileText", accent: "purple", feature: "protocols" },
  { href: "/between-the-buns/handbook", title: "Employee Handbook", desc: "Policies & e-signature acknowledgement.", iconKey: "bookCheck", accent: "red", feature: "handbook" },
  { href: "/between-the-buns/manuals", title: "Print & Procedure Manuals", desc: "Downloadable manuals by category.", iconKey: "printer", accent: "amber", feature: "manuals" },
  // Compliance & administration (management)
  { href: "/between-the-buns/compliance", title: "Compliance & Renewals", desc: "Licenses, permits & agreements with expiry alerts.", iconKey: "shield", accent: "red", feature: "compliance" },
  { href: "/between-the-buns/documents", title: "Business Documents", desc: "Forms, SOPs, brand assets & menus — plain files, no expiry.", iconKey: "file", accent: "amber", feature: "documents" },
  { href: "/between-the-buns/staff-licenses", title: "Staff Licenses & Certs", desc: "Food-handler cards & certifications with expiry.", iconKey: "idCard", accent: "purple", feature: "staff_licenses" },
  { href: "/between-the-buns/inspections", title: "In-House Inspections", desc: "Self-audit checklists with scoring & history.", iconKey: "clipboardCheck", accent: "green", feature: "inspections" },
  { href: "/between-the-buns/franchise-inspection", title: "Franchise Inspection", desc: "Weighted rubric — scoring, photo proofs & history.", iconKey: "clipboardCheck", accent: "red", feature: "franchise_inspection" },
  { href: "/between-the-buns/marketing", title: "Marketing", desc: "Promotions & the social media calendar.", iconKey: "megaphone", accent: "amber", feature: "marketing" },
  { href: "/between-the-buns/new-restaurant", title: "New Restaurant Checklist", desc: "Opening tasks by phase for a new location.", iconKey: "listChecks", accent: "purple", feature: "new_restaurant" },
  { href: "/between-the-buns/vault", title: "Login Vault", desc: "Encrypted credentials for vendor & utility logins.", iconKey: "key", accent: "red", feature: "vault" },
];

export function cardsForRole(role: string): BtbCard[] {
  return BTB_CARDS.filter((card) => btbCanView(card.feature, role as BtbRole));
}

/** Cards this role cannot see — used to explain the gap instead of hiding it silently. */
export function hiddenCardsForRole(role: string): BtbCard[] {
  return BTB_CARDS.filter((card) => !btbCanView(card.feature, role as BtbRole));
}

