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

/** Where the internal `/btb/demo` folder belongs for this session.
 *
 *  The proxy rewrites `/btb/<slug>/…` onto `/btb/demo/…`, but a hard navigation
 *  or a client link still goes to the folder path. Sending it to `permittedView`
 *  dropped the sub-path and, for a console, ejected the visitor straight out of
 *  the branch to `/btb/admin`. Keep the branch the session is in and the rest of
 *  the path instead.
 */
export function legacyFolderTarget(
  path: string,
  claims: WorkspaceClaims,
  sites: readonly { id: string; slug: string }[],
): string {
  if (claims.principalType !== "employee" && claims.principalType !== "console") return claims.permittedView;
  const site = sites.find((item) => item.id === claims.locationId);
  if (!site) return claims.permittedView;
  const rest = path.startsWith("/btb/demo") ? path.slice("/btb/demo".length) : "";
  return `/btb/${site.slug}${rest}`;
}
