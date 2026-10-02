import { MARKETING_ROLES, MGMT_ROLES, OPERATIONAL_ROLES, OWNER_TIER_ROLES } from "./roles";

const MGMT = MGMT_ROLES as string[];
const OWNER = OWNER_TIER_ROLES as string[];
// Every role except the designer — that tier is marketing-only (Patch 11).
const OPS = OPERATIONAL_ROLES as string[];

// Management/owner-tier admin screens: role-listed so proxy.ts can redirect
// anyone else to /admin.
export const ADMIN_ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin/vault", roles: OWNER },
  { prefix: "/admin/new-restaurant", roles: OWNER },
  { prefix: "/admin/compliance", roles: MGMT },
  { prefix: "/admin/documents", roles: MGMT },
  { prefix: "/admin/staff-licenses", roles: MGMT },
  { prefix: "/admin/marketing", roles: [...MARKETING_ROLES] },
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

// Operational sheets + the admin pages staff may view. The designer is
// deliberately absent: its only surfaces are /dashboard (Marketing Studio) and
// /admin/marketing. /dashboard and /admin itself stay off this list — the
// designer lands on the dashboard's marketing view, and /admin is the redirect
// sink proxy.ts sends denied roles to.
const SHEET_PREFIXES = PROTECTED_PREFIXES.filter((p) => p !== "/admin" && p !== "/dashboard");

export const OPS_ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  ...SHEET_PREFIXES.map((prefix) => ({ prefix, roles: OPS })),
  { prefix: "/admin/emergency", roles: OPS },
  { prefix: "/admin/protocols", roles: OPS },
  { prefix: "/admin/handbook", roles: OPS },
  { prefix: "/admin/print-materials", roles: OPS },
];

const ROUTE_ROLES = [...ADMIN_ROUTE_ROLES, ...OPS_ROUTE_ROLES];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matches(pathname, p));
}

export function requiredRolesFor(pathname: string): string[] | null {
  const match = ROUTE_ROLES.find((r) => matches(pathname, r.prefix));
  return match ? match.roles : null;
}

export function canAccess(pathname: string, role: string): boolean {
  if (!isProtectedPath(pathname)) return true;
  const roles = requiredRolesFor(pathname);
  if (!roles) return true;
  return roles.includes(role);
}
