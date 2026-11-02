import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BTB_COOKIE, btbAccountFor, employeeClaimsFromSession, roleFromSession } from "./btb-auth";
import { btbCanEdit, btbCanView, type BtbFeature } from "./btb-access";
import { BTB_CARDS } from "./btb-hub";
import { pageSlug } from "./btb-page-access";
import { BTB_RESTAURANT, type BtbEmployee, type BtbIdentity } from "./btb-team";
import { inventoryDb } from "./supabase-server";

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
export const EMPLOYEE_COLUMNS = "id,name,email,phone,position,role,active,login_enabled,version,created_at";
export const TEAM_COLUMNS = "id,name,position,role,active";

export class BtbApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function dbError(error: { code?: string; message?: string } | null, message: string): void {
  if (!error) return;
  if (error.code === "23505") throw new BtbApiError("That record already exists. Reload before trying again.", 409);
  if (error.code === "40001") throw new BtbApiError("This record changed on another device. Reload the latest version before saving your draft.", 409);
  throw new BtbApiError(message, 503);
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
  if (value?.startsWith("employee.")) {
    const claims = employeeClaimsFromSession(value);
    if (!claims) return null;
    const client = db ?? inventoryDb();
    const [member, credentials] = await Promise.all([
      client.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).eq("id", claims.id).maybeSingle(),
      client.from("btb_employee_credentials").select("session_version").eq("employee_id", claims.id).maybeSingle(),
    ]);
    dbError(member.error ?? credentials.error, "Your employee session could not be verified. Please try again.");
    const employee = member.data as BtbEmployee | null;
    if (!employee?.active || !employee.login_enabled || employee.role !== claims.role || credentials.data?.session_version !== claims.version) return null;
    return { role: employee.role, employeeId: employee.id, name: employee.name, email: employee.email ?? "", sessionVersion: claims.version };
  }
  const role = roleFromSession(value);
  const account = role ? btbAccountFor(role) : null;
  return account ? { role: account.role, name: account.name, email: account.email, employeeId: null } : null;
}

export async function verifiedBtbRole(value: string | undefined | null) {
  return (await btbIdentityFromSession(value))?.role ?? null;
}

export interface BtbApiContext { db: SupabaseClient; identity: BtbIdentity }

export async function requireBtbAccess(feature?: BtbFeature, edit = false): Promise<BtbApiContext> {
  const value = (await cookies()).get(BTB_COOKIE)?.value;
  if (!value) throw new BtbApiError("Please sign in to continue.", 401);
  const db = inventoryDb();
  const identity = await btbIdentityFromSession(value, db);
  if (!identity) throw new BtbApiError("Your session has ended. Please sign in again.", 401);
  if (feature) {
    if (!btbCanView(feature, identity.role) || (edit && !btbCanEdit(feature, identity.role))) throw new BtbApiError("Your role cannot make this change.", 403);
    const card = BTB_CARDS.find((item) => item.feature === feature);
    if (card && identity.role !== "admin") {
      const access = await db.from("role_page_access").select("allowed").eq("role", identity.role).eq("page", pageSlug(card));
      dbError(access.error, "Page access could not be verified. Please try again.");
      if (access.data?.some((row) => !row.allowed)) throw new BtbApiError("This page is not enabled for your role.", 403);
    }
  }
  return { db, identity };
}

export function apiFailure(error: unknown): NextResponse {
  return NextResponse.json({ error: error instanceof BtbApiError ? error.message : "The workspace could not complete this request. Please try again." }, { status: error instanceof BtbApiError ? error.status : 503, headers: PRIVATE_HEADERS });
}

export function requireBtbOrigin(request: Request, message = "Open this form in your BTB workspace and try again."): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url);
  // NextURL normalizes 127.0.0.1 to localhost. The browser's Host header keeps
  // the actual request authority, including its port, for an exact comparison.
  expected.host = request.headers.get("host") ?? expected.host;
  if (origin !== expected.origin) throw new BtbApiError(message, 403);
}

export function btbRoute(feature: BtbFeature | undefined, edit: boolean, handler: (context: BtbApiContext, request: Request) => Promise<unknown>) {
  return async (request: Request) => {
    try {
      if (edit || !["GET", "HEAD"].includes(request.method)) {
        requireBtbOrigin(request);
      }
      const data = await handler(await requireBtbAccess(feature, edit), request);
      return NextResponse.json(data, { headers: PRIVATE_HEADERS });
    } catch (error) { return apiFailure(error); }
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
