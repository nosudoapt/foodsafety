import { BtbApiError } from "./api-errors";
import { INVALID_LOGIN, NO_ACTIVE_WORKSPACE, WORKSPACE_MAX_AGE, normalizedEmail, type AuthPrincipal, type WorkspaceAuthContext, type WorkspaceClaims } from "./workspace-auth-types";

export interface CredentialAdapter {
  find(email: string): Promise<AuthPrincipal | null>;
  verify(candidate: AuthPrincipal | null, password: string): Promise<boolean>;
  verifyProvider(candidate: AuthPrincipal, password: string): Promise<boolean>;
  context(sub: string): Promise<WorkspaceAuthContext | null>;
}
/** Exactly one lookup and one authoritative verifier. Never retry another
 * password store, even if the winner is disabled or has no active workspace. */
export async function authenticatePrincipal(email: string, password: string, adapter: CredentialAdapter): Promise<WorkspaceAuthContext> {
  email = normalizedEmail(email);
  const candidate = await adapter.find(email);
  const valid = await adapter.verify(candidate, password);
  if (!valid || !candidate?.active || !candidate.principalActive || normalizedEmail(candidate.email) !== email) throw new BtbApiError(INVALID_LOGIN, 401);
  if (candidate.principalType === "supabase" && !await adapter.verifyProvider(candidate, password)) throw new BtbApiError(INVALID_LOGIN, 401);
  const latest = await adapter.context(candidate.sub);
  if (!latest?.active || !latest.principalActive || latest.version !== candidate.version
    || latest.principalType !== candidate.principalType || latest.credentialId !== candidate.credentialId
    || normalizedEmail(latest.email) !== email) throw new BtbApiError(INVALID_LOGIN, 401);
  return latest;
}

export function permittedViewFor(context: WorkspaceAuthContext, locationId: string, now = Date.now()): string {
  if (context.trialEndsAt && Date.parse(context.trialEndsAt) <= now) return "/trial-expired";
  if (context.principalType === "console") return "/btb/admin";
  if (context.principalType === "employee") {
    const site = context.locations.find(location => location.id === locationId);
    if (!site || !site.slug) throw new BtbApiError(NO_ACTIVE_WORKSPACE, 403);
    return `/btb/${site.slug}`;
  }
  return context.role === "designer" ? "/admin/marketing" : "/dashboard";
}

export function claimsForWorkspace(context: WorkspaceAuthContext, sid: string, locationId?: string, now = Date.now(), expires?: number): WorkspaceClaims {
  if (!context.active || !context.principalActive || !context.tenantId || !context.tenantSlug || !context.locations.length) throw new BtbApiError(NO_ACTIVE_WORKSPACE, 403);
  const ids = context.locations.map(site => site.id).sort();
  const current = locationId ?? ids[0];
  if (!ids.includes(current)) throw new BtbApiError("This location is not in your workspace.", 403);
  if (ids.length > 40) throw new BtbApiError("Your workspace requires administrator configuration.", 503);
  return { sub: context.sub, principalType: context.principalType, tenantId: context.tenantId, tenantSlug: context.tenantSlug,
    locationId: current, allowedLocationIds: ids, role: context.role, permittedView: permittedViewFor(context, current, now),
    version: context.version, exp: expires ?? Math.floor(now / 1000) + WORKSPACE_MAX_AGE, sid };
}

export function sessionMatchesContext(claims: WorkspaceClaims, context: WorkspaceAuthContext, now = Date.now()): boolean {
  const ids = context.locations.map(site => site.id).sort();
  return context.active && context.principalActive && claims.sub === context.sub && claims.version === context.version
    && claims.principalType === context.principalType && claims.role === context.role
    && claims.tenantId === context.tenantId && claims.tenantSlug === context.tenantSlug
    && ids.includes(claims.locationId) && JSON.stringify(ids) === JSON.stringify([...claims.allowedLocationIds].sort())
    && claims.permittedView === permittedViewFor(context, claims.locationId, now);
}
