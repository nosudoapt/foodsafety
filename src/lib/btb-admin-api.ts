import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiFailure, BtbApiError, PRIVATE_HEADERS, requireBtbOrigin } from "./btb-api";
import { BTB_ADMIN_COOKIE, btbAdminIdentityFromSession } from "./btb-admin-auth";
import type { BtbAdminIdentity } from "./btb-admin";
import { inventoryDb } from "./supabase-server";

export interface BtbAdminContext { db: SupabaseClient; admin: BtbAdminIdentity }

export async function requireBtbAdmin(): Promise<BtbAdminContext> {
  const value = (await cookies()).get(BTB_ADMIN_COOKIE)?.value;
  if (!value) throw new BtbApiError("Please sign in to the BTB console.", 401);
  const db = inventoryDb();
  const admin = await btbAdminIdentityFromSession(value, db);
  if (!admin) throw new BtbApiError("Your console session has ended. Please sign in again.", 401);
  return { db, admin };
}

export function btbAdminRoute(handler: (context: BtbAdminContext, request: Request) => Promise<unknown>) {
  return async (request: Request) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) requireBtbOrigin(request, "Open this form in the BTB console and try again.");
      return NextResponse.json(await handler(await requireBtbAdmin(), request), { headers: PRIVATE_HEADERS });
    } catch (error) { return apiFailure(error, request); }
  };
}

/** Console RPCs receive only the server-verified admin id and version. */
export async function btbAdminRpc<T>(context: BtbAdminContext, name: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await context.db.rpc(name, { ...args, p_actor: context.admin.id, p_session: context.admin.sessionVersion });
  if (error) {
    const status = error.code === "42501" ? 403 : ["40001", "23505"].includes(error.code ?? "") ? 409
      : error.code?.startsWith("22") || error.code === "23514" ? 400 : 503;
    throw new BtbApiError(status === 409 ? "This record changed or already exists. Reload before trying again." : fallback, status, error);
  }
  return data as T;
}
