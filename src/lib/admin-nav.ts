// The admin navigation model, extracted from the layout so it can be grouped,
// searched, and unit-tested without rendering React.
//
// Access tiers come from roles.ts — never invent one here. `roles` on each
// item is the list of roles that may *see* the link; the route guard in
// route-guards.ts remains the authority on whether the page opens.
//
// Relative imports only (no "@/") so tests/*.test.ts can compile this file.
import { MGMT_ROLES, MARKETING_ROLES, OPERATIONAL_ROLES, OWNER_TIER_ROLES } from "./roles";

export type NavIcon =
  | "dashboard"
  | "burger"
  | "cash"
  | "calendar"
  | "training"
  | "inventory"
  | "branding"
  | "shield"
  | "documents"
  | "licenses"
  | "emergency"
  | "protocols"
  | "handbook"
  | "vault"
  | "marketing"
  | "inspection"
  | "corporate"
  | "manuals"
  | "print"
  | "newrestaurant"
  | "temperature"
  | "checks"
  | "cleaning"
  | "allergens"
  | "delivery"
  | "pest"
  | "reports"
  | "settings";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: NavIcon;
  roles: readonly string[];
  /** Extra words the command palette should match on. */
  keywords?: string;
  /** Shown as a right-aligned keyboard hint in the rail. */
  kbd?: string;
}

export interface AdminNavGroup {
  /** Group heading in the rail. Empty string = no heading. */
  label: string;
  items: AdminNavItem[];
}

const OPS = OPERATIONAL_ROLES as readonly string[];
const MGMT = MGMT_ROLES as readonly string[];
const OWNER = OWNER_TIER_ROLES as readonly string[];

// Grouped by *when you use it*, not by module. A shift lead looks at the top
// two groups; a manager works down; the owner tier owns the last.
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "This shift",
    items: [
      {
        label: "Overview",
        href: "/admin",
        icon: "dashboard",
        roles: OPS,
        keywords: "dashboard home admin summary",
        kbd: "G O",
      },
      {
        label: "Between the Buns",
        href: "/between-the-buns",
        icon: "burger",
        roles: OPS,
        keywords: "hub prep order sheet btb",
      },
      {
        label: "Emergency Contacts",
        href: "/admin/emergency",
        icon: "emergency",
        roles: OPS,
        keywords: "phone numbers escalation outage",
      },
      {
        label: "Protocols",
        href: "/admin/protocols",
        icon: "protocols",
        roles: OPS,
        keywords: "outage procedure steps",
      },
      {
        label: "Handbook",
        href: "/admin/handbook",
        icon: "handbook",
        roles: OPS,
        keywords: "employee manual policy",
      },
    ],
  },
  {
    label: "Compliance",
    items: [
      {
        label: "Compliance & Renewals",
        href: "/admin/compliance",
        icon: "shield",
        roles: MGMT,
        keywords: "expiry licences permits insurance renewal",
        kbd: "G C",
      },
      {
        label: "Documents",
        href: "/admin/documents",
        icon: "documents",
        roles: MGMT,
        keywords: "files upload sops brand assets",
      },
      {
        label: "Staff Licenses",
        href: "/admin/staff-licenses",
        icon: "licenses",
        roles: MGMT,
        keywords: "certificates food hygiene staff",
      },
      {
        label: "In-House Inspection",
        href: "/admin/inspections",
        icon: "inspection",
        roles: MGMT,
        keywords: "audit checklist self inspection",
      },
      {
        label: "Corporate Inspection",
        href: "/admin/inspections/corporate",
        icon: "corporate",
        roles: MGMT,
        keywords: "group audit corporate visit",
      },
    ],
  },
  {
    label: "Running the site",
    items: [
      {
        label: "Cash Out",
        href: "/between-the-buns/cash-out",
        icon: "cash",
        roles: MGMT,
        keywords: "till close reconciliation money",
      },
      {
        label: "Month-End Inventory",
        href: "/between-the-buns/month-end-inventory",
        icon: "inventory",
        roles: MGMT,
        keywords: "stock count variance",
      },
      {
        label: "Training Guide",
        href: "/between-the-buns/training-guide",
        icon: "training",
        roles: MGMT,
        keywords: "onboarding teach",
      },
      {
        label: "Marketing",
        href: "/admin/marketing",
        icon: "marketing",
        roles: MARKETING_ROLES as readonly string[],
        keywords: "promo portal designer branding",
      },
      {
        label: "Branding Requests",
        href: "/between-the-buns/branding-requests",
        icon: "branding",
        roles: MGMT,
        keywords: "design request artwork",
      },
    ],
  },
  {
    label: "Reference & print",
    items: [
      {
        label: "Print Manuals",
        href: "/admin/manuals",
        icon: "manuals",
        roles: MGMT,
        keywords: "pdf documents print",
      },
      {
        label: "Print Materials",
        href: "/admin/print-materials",
        icon: "print",
        roles: MGMT,
        keywords: "signs charts posters print",
      },
    ],
  },
  {
    label: "Owner tier",
    items: [
      {
        label: "Login Vault",
        href: "/admin/vault",
        icon: "vault",
        roles: OWNER,
        keywords: "passwords credentials pos banking secrets",
        kbd: "G V",
      },
      {
        label: "New Restaurant",
        href: "/admin/new-restaurant",
        icon: "newrestaurant",
        roles: OWNER,
        keywords: "open site launch onboard",
      },
    ],
  },
];

/** Every item, flattened. */
export const ALL_ADMIN_NAV: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items);

/**
 * The groups this role may see. Groups that end up empty are dropped so the
 * rail never shows a heading with nothing under it.
 */
export function navForRole(role: string | null | undefined): AdminNavGroup[] {
  if (!role) return [];
  return ADMIN_NAV.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

/** Which item is the current page. Longest matching href wins so
 *  /admin/inspections/corporate doesn't light up /admin/inspections. */
export function activeHref(pathname: string, role?: string | null): string | null {
  const items = role ? navForRole(role).flatMap((g) => g.items) : ALL_ADMIN_NAV;
  let best: string | null = null;
  for (const item of items) {
    const exact = pathname === item.href;
    const prefix = item.href !== "/admin" && pathname.startsWith(item.href + "/");
    if ((exact || prefix) && (!best || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

/**
 * The command-palette result set for a query. Matches the label and the
 * keyword bag, case-insensitively; a prefix match on the label ranks first.
 */
export function searchNav(query: string, role: string | null | undefined): AdminNavItem[] {
  const items = navForRole(role).flatMap((g) => g.items);
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const scored = items
    .map((item) => {
      const label = item.label.toLowerCase();
      const bag = `${label} ${item.keywords ?? ""} ${item.href}`;
      if (label.startsWith(q)) return { item, score: 0 };
      if (label.includes(q)) return { item, score: 1 };
      if (bag.includes(q)) return { item, score: 2 };
      return null;
    })
    .filter((x): x is { item: AdminNavItem; score: number } => x !== null);

  scored.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  return scored.map((s) => s.item);
}

/** Human page title for the breadcrumb, e.g. /admin/compliance → "Compliance & Renewals". */
export function navLabelFor(pathname: string): string | null {
  const href = activeHref(pathname);
  if (!href) return null;
  return ALL_ADMIN_NAV.find((i) => i.href === href)?.label ?? null;
}
