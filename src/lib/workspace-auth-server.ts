import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { BtbApiError } from "./api-errors";
import { serviceDb } from "./supabase-server";
import { btbOriginAllowed } from "./btb-origin";
import { firstAttemptRow } from "./btb-login-guard";
import { authenticatePrincipal, claimsForWorkspace, sessionMatchesContext, type CredentialAdapter } from "./workspace-auth-core";
import { verifyWorkspacePassword } from "./workspace-passwords";
import { signWorkspaceSession, verifyWorkspaceSession } from "./workspace-session";
import { scopedWorkspaceDb } from "./workspace-scoped-db";
import { isBtbRole } from "./btb-roles";
import type { BtbIdentity } from "./btb-team";
import { INVALID_LOGIN, WORKSPACE_COOKIE, normalizedEmail, parseAuthPrincipal, parseWorkspaceContext, type PublicWorkspaceSession, type WorkspaceAuthContext, type WorkspaceClaims } from "./workspace-auth-types";

export const AUTH_PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export interface VerifiedWorkspaceSession { claims: WorkspaceClaims; principal: WorkspaceAuthContext; db: SupabaseClient }
export function workspaceSigningKey(): Buffer {
  const secret = process.env.AUTH_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret || secret.length < 32) throw new BtbApiError("Authentication is not configured.", 503);
  return createHmac("sha256", secret).update("foodsafe-unified-session-signing:v1").digest();
}
function authDbError(error: unknown): void {
  if (error) throw new BtbApiError("Authentication could not be verified. Please retry.", 503, error);
}
export async function loadWorkspaceContext(sub: string, db = serviceDb()): Promise<WorkspaceAuthContext | null> {
  const result = await db.rpc("workspace_auth_context", { p_principal: sub });
  authDbError(result.error);
  return parseWorkspaceContext(result.data);
}
export function credentialAdapter(db = serviceDb()): CredentialAdapter {
  return {
    async find(email) {
      const result = await db.rpc("workspace_auth_candidate", { p_email: email });
      authDbError(result.error);
      return parseAuthPrincipal(result.data);
    },
    verify: verifyWorkspacePassword,
    async verifyProvider(candidate, password) {
      const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      if (!url || !key) throw new BtbApiError("Authentication is not configured.", 503);
      // NEVER sign in on the cached privileged inventoryDb() client. Provider
      // tokens live only in this isolated, non-persisting request client.
      const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await verifier.auth.signInWithPassword({ email: candidate.email, password });
      if (error || data.user?.id !== candidate.credentialId) return false;
      if (data.session) await verifier.auth.signOut({ scope: "local" });
      return true;
    },
    context: sub => loadWorkspaceContext(sub, db),
  };
}

/** Only trust a header installed/overwritten by the deployment's reverse
 * proxy. Without one, the shared 'unknown' IP bucket fails closed. */
export function loginIp(request: Request): string {
  const header = process.env.AUTH_TRUSTED_IP_HEADER?.trim() || (process.env.VERCEL ? "x-vercel-forwarded-for" : "");
  const value = header ? request.headers.get(header)?.split(",").at(-1)?.trim() : null;
  return value && isIP(value) ? value : "unknown";
}
export function requireAuthOrigin(request: Request): void {
  if (!btbOriginAllowed(request)) throw new BtbApiError("Open this form on this site and try again.", 403);
}
export async function loginWorkspace(email: string, password: string, request: Request): Promise<WorkspaceAuthContext> {
  const db = serviceDb();
  const emailKey = createHmac("sha256", workspaceSigningKey()).update(normalizedEmail(email)).digest("hex");
  const ipKey = createHmac("sha256", workspaceSigningKey()).update(loginIp(request)).digest("hex");
  const reservation = await db.rpc("workspace_auth_reserve", { p_email_key: emailKey, p_ip_key: ipKey });
  authDbError(reservation.error);
  const attempt = firstAttemptRow(reservation.data);
  if (attempt.blocked) throw new BtbApiError(INVALID_LOGIN, 429);
  const context = await authenticatePrincipal(email, password, credentialAdapter(db));
  // Correct passwords with no assignment aren't password failures.
  const cleared = await db.rpc("workspace_auth_success", { p_email_key: emailKey, p_ip_key: ipKey });
  authDbError(cleared.error);
  return context;
}

export async function workspaceSessionFromValue(value: string | null | undefined, db?: SupabaseClient): Promise<VerifiedWorkspaceSession | null> {
  if (!value) return null;
  const claims = verifyWorkspaceSession(value, workspaceSigningKey());
  if (!claims) return null;
  const client = db ?? serviceDb();
  const [principal, stored] = await Promise.all([
    loadWorkspaceContext(claims.sub, client),
    client.from("workspace_auth_sessions").select("version,expires_at,revoked_at,tenant_id,location_id,role")
      .eq("id", claims.sid).eq("principal_id", claims.sub).maybeSingle(),
  ]);
  authDbError(stored.error);
  if (!principal || !stored.data || stored.data.revoked_at || stored.data.version !== claims.version
    || stored.data.tenant_id !== claims.tenantId || stored.data.location_id !== claims.locationId || stored.data.role !== claims.role
    || Date.parse(stored.data.expires_at) <= Date.now() || Math.floor(Date.parse(stored.data.expires_at) / 1000) !== claims.exp
    || !sessionMatchesContext(claims, principal)) return null;
  return { claims, principal, db: await scopedWorkspaceDb(client, claims, principal) };
}
export async function requireWorkspaceSession(): Promise<VerifiedWorkspaceSession> {
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const session = await workspaceSessionFromValue(value);
  if (!session) throw new BtbApiError("Please sign in to continue.", 401);
  return session;
}
export async function createWorkspaceSession(context: WorkspaceAuthContext, locationId?: string, expires?: number, previous?: string): Promise<WorkspaceClaims> {
  const claims = claimsForWorkspace(context, randomUUID(), locationId, Date.now(), expires);
  const result = await serviceDb().rpc("workspace_create_session", {
    p_id: claims.sid, p_principal: claims.sub, p_version: claims.version, p_tenant: claims.tenantId,
    p_location: claims.locationId, p_role: claims.role, p_exp: new Date(claims.exp * 1000).toISOString(), p_previous: previous ?? null,
  });
  authDbError(result.error);
  return claims;
}
export async function revokeWorkspaceSession(claims: WorkspaceClaims): Promise<void> {
  const result = await serviceDb().from("workspace_auth_sessions").update({ revoked_at: new Date().toISOString() })
    .eq("id", claims.sid).eq("principal_id", claims.sub);
  authDbError(result.error);
}
export async function setWorkspaceCookie(response: NextResponse, claims?: WorkspaceClaims): Promise<void> {
  // The old BTB doors are gone, but the Supabase provider cookie stays: the
  // green app's RLS-scoped pages still read through it (Phase 2 moves them onto
  // server endpoints). Clearing it here would sign them out of their own data.
  const retired = ["btb_session", "btb_admin_session", "btb_slug", "platform_admin"];
  for (const name of retired) response.cookies.set(name, "", { path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
  response.cookies.set(WORKSPACE_COOKIE, claims ? signWorkspaceSession(claims, workspaceSigningKey()) : "", {
    path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: claims ? Math.max(0, claims.exp - Math.floor(Date.now() / 1000)) : 0,
  });
}

/** Bridge the one sign-in to the provider session the existing RLS-scoped pages
 * still use. The password has already been verified against the provider, so
 * this only persists the resulting token in cookies; it grants nothing new. */
export async function establishSupabaseBridge(email: string, password: string): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;
  const jar = await cookies();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => { for (const item of items) jar.set(item.name, item.value, item.options); },
    },
  });
  await client.auth.signInWithPassword({ email, password });
}
export function publicWorkspaceSession(session: VerifiedWorkspaceSession): PublicWorkspaceSession {
  const { claims, principal } = session;
  return { authenticated: true, sub: claims.sub, userId: principal.credentialId, principalType: claims.principalType,
    role: claims.role, name: principal.name, email: principal.email, tenantId: claims.tenantId, tenantSlug: claims.tenantSlug,
    tenantName: principal.tenantName, locationId: claims.locationId, locations: principal.locations, permittedView: claims.permittedView };
}

export function workspaceBtbIdentity(session: VerifiedWorkspaceSession): BtbIdentity {
  const { claims, principal } = session;
  if (claims.principalType !== "employee" || claims.tenantSlug !== "between-the-buns" || !isBtbRole(claims.role) || claims.role === "admin") {
    throw new BtbApiError("This surface is not in your workspace.", 403);
  }
  return { role: claims.role, employeeId: principal.credentialId, name: principal.name, email: principal.email,
    sessionVersion: principal.sourceVersion ?? undefined, sub: claims.sub, tenantId: claims.tenantId,
    currentLocationId: claims.locationId, allowedLocationIds: claims.allowedLocationIds, sessionId: claims.sid };
}
