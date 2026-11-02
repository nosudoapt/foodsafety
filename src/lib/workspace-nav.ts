import { ADMIN_NAV, type AdminNavGroup, type AdminNavItem } from "./admin-nav";
import { ALL_ROLES, OPERATIONAL_ROLES, isRole } from "./roles";
import { canAccess } from "./route-guards";

const operations: AdminNavItem[] = [
  { label: "Daily checks", href: "/checks", icon: "checks", keywords: "opening closing shift checklist", roles: OPERATIONAL_ROLES },
  { label: "Temperatures", href: "/temperatures", icon: "temperature", keywords: "fridge cooking cold holding readings", roles: OPERATIONAL_ROLES },
  { label: "Cleaning", href: "/cleaning", icon: "cleaning", keywords: "hygiene sanitise tasks", roles: OPERATIONAL_ROLES },
  { label: "Allergens", href: "/allergens", icon: "allergens", keywords: "menu allergy dietary", roles: OPERATIONAL_ROLES },
  { label: "Deliveries", href: "/deliveries", icon: "delivery", keywords: "supplier receiving goods", roles: OPERATIONAL_ROLES },
  { label: "Corrective actions", href: "/corrective-actions", icon: "protocols", keywords: "issues fix resolve follow up", roles: OPERATIONAL_ROLES },
  { label: "Pest control", href: "/pest-control", icon: "pest", keywords: "inspection register pest", roles: OPERATIONAL_ROLES },
  { label: "Training records", href: "/training", icon: "training", keywords: "people certificates learning", roles: OPERATIONAL_ROLES },
  { label: "Reports", href: "/reports", icon: "reports", keywords: "export pdf records audit", roles: OPERATIONAL_ROLES },
];

// Both shells and the dashboard directory use this model. A second navigation
// system was the reason moving from a log to administration felt like leaving
// the app. BTB remains a clearly named, separately authenticated workspace.
const groups: AdminNavGroup[] = [
  { label: "Workspace", items: [{ label: "Overview", href: "/dashboard", icon: "dashboard", roles: ALL_ROLES, keywords: "home dashboard priorities summary" }] },
  { label: "Daily operations", items: operations },
  ...ADMIN_NAV.map((group) => ({
    label: group.label === "This shift" ? "Team reference" : group.label,
    items: group.items.filter((item) => item.href !== "/admin" && !item.href.startsWith("/between-the-buns")),
  })),
  { label: "Connected workspace", items: [{ label: "Between the Buns", href: "/between-the-buns", icon: "burger", roles: OPERATIONAL_ROLES, keywords: "btb inventory stock prep cash out order sheet roster" }] },
];

export function workspaceNavForRole(role: string | null | undefined): AdminNavGroup[] {
  if (!isRole(role)) return [];
  return groups.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => item.roles.includes(role) && canAccess(item.href, role)),
  })).filter((group) => group.items.length > 0);
}

export function searchWorkspace(query: string, role: string | null | undefined): AdminNavItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return workspaceNavForRole(role).flatMap((group) => group.items)
    .filter((item) => terms.every((term) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(term)));
}

export function activeWorkspaceItem(pathname: string, role: string | null | undefined): AdminNavItem | undefined {
  const path = pathname === "/admin" ? "/dashboard" : pathname;
  return workspaceNavForRole(role).flatMap((group) => group.items)
    .filter((item) => path === item.href || path.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
