// Safe to import in the browser. Authorization is always re-derived on the server.
export const WORKSPACE_COOKIE = "workspace_session";
export const WORKSPACE_MAX_AGE = 12 * 60 * 60;
export const INVALID_LOGIN = "Invalid email or password";
export const NO_ACTIVE_WORKSPACE = "No active workspace assigned — contact your manager";
export const AUTH_SESSION_EVENT = "workspace-session-changed";
export const AUTH_SESSION_STORAGE = "workspace-session-change";

export const PRINCIPAL_TYPES = ["console", "supabase", "employee"] as const;
export type PrincipalType = typeof PRINCIPAL_TYPES[number];
export const AUTH_ROLES = ["staff", "supervisor", "manager", "owner", "multi_location_owner", "corporate", "designer", "admin"] as const;
export type AuthRole = typeof AUTH_ROLES[number];
export interface WorkspaceLocation { id: string; name: string; slug: string; address?: string | null }
export interface AuthPrincipal {
  sub: string;
  principalType: PrincipalType;
  credentialId: string;
  version: number;
  sourceVersion: number | null;
  active: boolean;
  principalActive: boolean;
  tenantId: string | null;
  role: AuthRole;
  name: string;
  email: string;
  passwordHash?: string | null;
  trialEndsAt?: string | null;
}
export interface WorkspaceAuthContext extends AuthPrincipal {
  tenantSlug: string | null;
  tenantName: string;
  locations: WorkspaceLocation[];
}
export interface WorkspaceClaims {
  sub: string;
  principalType: PrincipalType;
  tenantId: string;
  tenantSlug: string;
  locationId: string;
  allowedLocationIds: string[];
  role: AuthRole;
  permittedView: string;
  version: number;
  exp: number;
  /** Random server-side session id, for logout and cross-tab scope revocation. */
  sid: string;
}
export interface PublicWorkspaceSession {
  authenticated: true;
  sub: string;
  userId: string;
  principalType: PrincipalType;
  role: AuthRole;
  name: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  locationId: string;
  locations: WorkspaceLocation[];
  permittedView: string;
  /** BTB page grants are a projection of the same verified session, not a second identity. */
  btbAccess?: import("./btb-page-access").BtbEffectiveAccess;
}

export const authUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const authVersion = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) < 2_147_483_647;
export const authSlug = (value: unknown): value is string => typeof value === "string" && value.length <= 100 && /^[a-z0-9][a-z0-9-]*$/.test(value);
export function normalizedEmail(value: string): string { return value.trim().toLowerCase(); }

export function parseAuthPrincipal(value: unknown): AuthPrincipal | null {
  if (!value || typeof value !== "object") return null;
  const row = value as AuthPrincipal;
  if (!authUuid(row.sub) || !authUuid(row.credentialId) || !authVersion(row.version)
    || !(PRINCIPAL_TYPES as readonly string[]).includes(row.principalType)
    || !(AUTH_ROLES as readonly string[]).includes(row.role)
    || row.tenantId !== null && !authUuid(row.tenantId)
    || typeof row.name !== "string" || typeof row.email !== "string"
    || typeof row.principalActive !== "boolean") return null;
  return { ...row, active: row.active === true };
}
export function parseWorkspaceContext(value: unknown): WorkspaceAuthContext | null {
  const principal = parseAuthPrincipal(value);
  if (!principal || !value || typeof value !== "object") return null;
  const row = value as WorkspaceAuthContext;
  if (row.tenantSlug !== null && !authSlug(row.tenantSlug) || !Array.isArray(row.locations)
    || !row.locations.every(site => authUuid(site.id) && typeof site.name === "string" && authSlug(site.slug))
    || new Set(row.locations.map(site => site.id)).size !== row.locations.length) return null;
  // The request-time RPC must never carry password material to consumers.
  const safe = { ...principal };
  delete safe.passwordHash;
  return { ...safe, tenantSlug: row.tenantSlug, tenantName: row.tenantName ?? "", locations: row.locations };
}
