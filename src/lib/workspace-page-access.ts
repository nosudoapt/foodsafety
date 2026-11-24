import { canAccess, isProtectedPath } from "./route-guards";
import type { WorkspaceClaims } from "./workspace-auth-types";

export const pathWithin = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** Route hints never choose an identity, a tenant or a location.
 *
 *  `branchSlugs` is the set of branch workspaces the session may open. Employees
 *  already pass only their own branch through `permittedView`; a console passes
 *  the estate it administers, so it can enter any branch it is assigned to.
 */
export function workspacePageAllowed(path: string, claims: WorkspaceClaims, branchSlugs: readonly string[] = []): boolean {
  if (claims.permittedView === "/trial-expired") return path === "/trial-expired";
  if (claims.principalType === "console") {
    if (pathWithin(path, "/btb/admin") && !pathWithin(path, "/btb/admin/login")) return true;
    const branch = path.match(/^\/btb\/([a-z0-9][a-z0-9-]*)(\/|$)/)?.[1];
    return !!branch && branchSlugs.includes(branch);
  }
  if (claims.principalType === "employee") return pathWithin(path, claims.permittedView) && !path.endsWith("/login");
  if (!isProtectedPath(path)) return false;
  if (claims.role === "designer") return pathWithin(path, "/admin/marketing");
  return canAccess(path, claims.role === "supervisor" ? "manager" : claims.role);
}

export function assertCurrentLocation(claims: WorkspaceClaims, value: unknown): boolean {
  return value === undefined || value === claims.locationId;
}
