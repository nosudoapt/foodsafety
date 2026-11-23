import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiFailure, BtbApiError, PRIVATE_HEADERS, requireBtbOrigin } from "./btb-api";
import type { BtbAdminIdentity } from "./btb-admin";
import { requireWorkspaceSession, type VerifiedWorkspaceSession } from "./workspace-auth-server";
import { inWorkspace } from "./workspace-request-context";

export interface BtbAdminContext { db: SupabaseClient; admin: BtbAdminIdentity; session: VerifiedWorkspaceSession }

export async function requireBtbAdmin(): Promise<BtbAdminContext> {
  const session = await requireWorkspaceSession();
  if (session.claims.principalType !== "console" || session.claims.role !== "admin" || session.claims.tenantSlug !== "between-the-buns" || !session.principal.sourceVersion) throw new BtbApiError("This console is not in your workspace.", 403);
  const admin: BtbAdminIdentity = { id: session.principal.credentialId, name: session.principal.name, email: session.principal.email, sessionVersion: session.principal.sourceVersion };
  return { db: session.db, admin, session };
}

export function btbAdminRoute(handler: (context: BtbAdminContext, request: Request) => Promise<unknown>) {
  return async (request: Request) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) requireBtbOrigin(request, "Open this form in the BTB console and try again.");
      const context = await requireBtbAdmin();
      return NextResponse.json(await inWorkspace({ claims: context.session.claims, db: context.db }, () => handler(context, request)), { headers: PRIVATE_HEADERS });
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
