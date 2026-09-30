import { MGMT_ROLES, OWNER_TIER_ROLES } from "./roles";

const MGMT = MGMT_ROLES as string[];
const OWNER = OWNER_TIER_ROLES as string[];

export const ADMIN_ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin/vault", roles: OWNER },
  { prefix: "/admin/new-restaurant", roles: OWNER },
  { prefix: "/admin/compliance", roles: MGMT },
  { prefix: "/admin/documents", roles: MGMT },
  { prefix: "/admin/staff-licenses", roles: MGMT },
  { prefix: "/admin/marketing", roles: [...MGMT, "designer"] },
  { prefix: "/admin/inspections", roles: MGMT },
  { prefix: "/admin/manuals", roles: MGMT },
];

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/admin",
  "/checks",
  "/cleaning",
  "/temperatures",
  "/allergens",
  "/deliveries",
  "/corrective-actions",
  "/pest-control",
  "/training",
  "/reports",
  "/settings",
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matches(pathname, p));
}

export function requiredRolesFor(pathname: string): string[] | null {
  const match = ADMIN_ROUTE_ROLES.find((r) => matches(pathname, r.prefix));
  return match ? match.roles : null;
}

export function canAccess(pathname: string, role: string): boolean {
  if (!isProtectedPath(pathname)) return true;
  const roles = requiredRolesFor(pathname);
  if (!roles) return true;
  return roles.includes(role);
}
