import "server-only";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { btbCanEdit, btbCanView, type BtbFeature } from "./btb-access";
import { BTB_CARDS } from "./btb-hub";
import { btbPageAllowed, type BtbEffectiveAccess } from "./btb-page-access";
import { loadBtbEffectiveAccess, loadConsoleBtbAccess } from "./btb-effective-access";
import { resolveBtbLocation, type BtbLocationContext } from "./btb-location-context";
import { BTB_RESTAURANT, type BtbIdentity } from "./btb-team";
import { requireWorkspaceSession, workspaceBtbIdentity, workspaceSessionFromValue, type VerifiedWorkspaceSession } from "./workspace-auth-server";
import { consoleBranchIds } from "./workspace-console-sites";
import { serviceDb } from "./supabase-server";
import { inWorkspace } from "./workspace-request-context";
import { btbOriginAllowed } from "./btb-origin";
import { BtbApiError, failureDetails, publicFailure } from "./api-errors";
export { BtbApiError } from "./api-errors";

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const EMPLOYEE_COLUMNS = "id,name,email,phone,position,role,active,login_enabled,version,created_at";
export const TEAM_COLUMNS = "id,name,position,role,active";

export function dbError(error: { code?: string; message?: string } | null, message: string): void {
  if (!error) return;
  if (error.code === "23505") throw new BtbApiError("That record already exists. Reload before trying again.", 409, error);
  if (error.code === "40001") throw new BtbApiError("This record changed on another device. Reload the latest version before saving your draft.", 409, error);
  if (error.code === "42501") throw new BtbApiError("This request is not permitted in the current workspace.", 403, error);
  throw new BtbApiError(message, 503, error);
}

export async function readBody(request: Request, maxBytes = 256_000): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new BtbApiError("This request is too large.", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new BtbApiError("This request is too large.", 413); }
      chunks.push(value);
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new BtbApiError("Send a valid form and try again."); }
}

/** Always re-read account status and credential version for individual logins. */
export async function btbIdentityFromSession(value: string | undefined | null, db?: SupabaseClient): Promise<BtbIdentity | null> {
  const session = await workspaceSessionFromValue(value, db);
  if (!session || session.claims.principalType !== "employee" || session.claims.tenantSlug !== "between-the-buns") return null;
  return workspaceBtbIdentity(session);
}

export async function verifiedBtbRole(value: string | undefined | null) {
  return (await btbIdentityFromSession(value))?.role ?? null;
}

/** Membership OR invitation history switches personal accounts to scoped
 * workflows. Removed console people can never fall back to legacy access. */
export async function btbUsesLocationWorkspace(identity: BtbIdentity): Promise<boolean> {
  return !!identity.employeeId && !!identity.tenantId && !!identity.currentLocationId;
}

export async function legacyBtbRole(value: string | undefined | null) {
  const identity = await btbIdentityFromSession(value);
  if (!identity) return null;
  // The workspace is unified now: a location-workspace employee still uses the
  // older inventory screens for their branch. requireBtbAccess already verified
  // the credential version and page grant before this helper is called.
  return identity.role;
}

/** Removed console people remain managed; shared employee/schedule screens
 * must not reactivate them or alter their historical location workflow. */
export async function btbEmployeeIsLocationManaged(db: SupabaseClient, employeeId: string): Promise<boolean> {
  const result = await db.from("btb_location_access").select("employee_id").eq("employee_id", employeeId).limit(1);
  dbError(result.error, "This employee’s location access could not be verified. Please retry.");
  return !!result.data?.length;
}

export interface BtbApiContext { db: SupabaseClient; identity: BtbIdentity; access: BtbEffectiveAccess; session: VerifiedWorkspaceSession }
export interface BtbAccessOptions { allowLocationWorkspace?: boolean; page?: string; session?: VerifiedWorkspaceSession }

/**
 * The branch this request operates on. Written records are stamped with it and
 * reads are filtered by it, so two branches can never see each other's rows.
 * Query values only assert the current branch; they never select it.
 */
export async function btbRequestLocation(context: BtbApiContext, request: Request, explicit?: string | null): Promise<BtbLocationContext | null> {
  const param = explicit !== undefined ? explicit : new URL(request.url).searchParams.get("location");
  return resolveBtbLocation(context.identity, context.access, param);
}

export async function requireBtbAccess(feature?: BtbFeature, edit = false, options?: BtbAccessOptions): Promise<BtbApiContext> {
  const session = options?.session ?? await requireWorkspaceSession();
  const db = session.db;
  const identity = await workspaceBtbIdentity(session);
  // A console acting inside a branch keeps its own principal but uses its linked
  // employee for attribution; loadBtbEffectiveAccess resolves its page set from
  // the estate it administers.
  const access = await loadBtbEffectiveAccess(db, identity);
  if (feature) {
    if (feature === "platform" && !identity.employeeId) throw new BtbApiError("Sign in with your individual employee account to use the location workspace.", 401);
    // The console administers the store, so it acts with store-manager authority;
    // everyone else keeps exactly the role the matrix gives them.
    const mayEdit = btbCanEdit(feature, identity.console ? "manager" : identity.role);
    if (!btbCanView(feature, identity.role) || (edit && !mayEdit)) throw new BtbApiError("Your role cannot make this change.", 403);
    // Shared feature buckets (reference) must name their exact page. Never let
    // granting prep-manual implicitly authorize menu/allergen/fryer URLs.
    const candidates = BTB_CARDS.filter(item => item.feature === feature);
    const card = options?.page ? candidates.find(item => item.href === `/btb/demo/${options.page}`) : candidates.length === 1 ? candidates[0] : undefined;
    if (!card || !btbPageAllowed(card, identity.role, access.rows, access.pageGrants)) throw new BtbApiError("This page is not enabled in your workspace.", 403);
  }
  return { db, identity, access, session };
}

export async function apiFailure(error: unknown, request?: Request, tenant = BTB_RESTAURANT): Promise<NextResponse> {
  const incoming = request?.headers ?? await headers();
  const supplied = incoming.get("x-request-id");
  const requestId = supplied && /^[A-Za-z0-9_-]{1,64}$/.test(supplied) ? supplied : randomUUID();
  const failure = publicFailure(error);
  if (failure.status >= 500 || (error instanceof BtbApiError && error.cause)) {
    console.error(JSON.stringify({ event: "request_failed", request_id: requestId, tenant,
      ...(request ? { path: new URL(request.url).pathname, method: request.method } : {}),
      status: failure.status, operation: failure.error, details: failureDetails(error) }));
  }
  return NextResponse.json({ error: failure.error, request_id: requestId }, {
    status: failure.status, headers: { ...PRIVATE_HEADERS, "x-request-id": requestId },
  });
}

export function databaseFailure(error: unknown, message = "The inventory request could not be completed. Please retry.", status = 500, tenant = BTB_RESTAURANT) {
  return apiFailure(new BtbApiError(message, status, error), undefined, tenant);
}

export function requireBtbOrigin(request: Request, message = "Open this form in your BTB workspace and try again."): void {
  if (!btbOriginAllowed(request)) throw new BtbApiError(message, 403);
}

export function btbRoute(feature: BtbFeature | undefined, edit: boolean, handler: (context: BtbApiContext, request: Request) => Promise<unknown>, options?: BtbAccessOptions) {
  return async (request: Request) => {
    try {
      if (edit || !["GET", "HEAD"].includes(request.method)) {
        requireBtbOrigin(request);
      }
      const context = await requireBtbAccess(feature, edit, options);
      const location = new URL(request.url).searchParams.get("location");
      if (location !== null && location !== context.session.claims.locationId) throw new BtbApiError("This location is not the current workspace.", 403);
      const data = await inWorkspace({ claims: context.session.claims, db: context.db }, () => handler(context, request));
      return NextResponse.json(data, { headers: PRIVATE_HEADERS });
    } catch (error) { return apiFailure(error, request); }
  };
}

export async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>, message: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += 500) {
    const result = await query(from, from + 499);
    dbError(result.error, message);
    if (!result.data) throw new BtbApiError(message, 503);
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
  throw new BtbApiError("This register is too large to load completely. Contact your manager.", 503);
}
