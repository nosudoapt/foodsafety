import { canAccess, isProtectedPath } from "./route-guards";
import type { WorkspaceClaims } from "./workspace-auth-types";

export const pathWithin = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** Route hints never choose an identity, a tenant or a location. */
export function workspacePageAllowed(path: string, claims: WorkspaceClaims): boolean {
  if (claims.permittedView === "/trial-expired") return path === "/trial-expired";
  if (claims.principalType === "console") return pathWithin(path, "/btb/admin") && !pathWithin(path, "/btb/admin/login");
  if (claims.principalType === "employee") return pathWithin(path, claims.permittedView) && !path.endsWith("/login");
  if (!isProtectedPath(path)) return false;
  if (claims.role === "designer") return pathWithin(path, "/admin/marketing");
  return canAccess(path, claims.role === "supervisor" ? "manager" : claims.role);
}

export function assertCurrentLocation(claims: WorkspaceClaims, value: unknown): boolean {
  return value === undefined || value === claims.locationId;
}
