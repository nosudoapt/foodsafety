import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError, requireBtbAccess } from "./btb-api";
import type { BtbRole } from "./btb-roles";
import { publicPlatformFailure } from "./api-errors";

export interface PlatformActor {
  db: SupabaseClient;
  /** Personal employee id - never a shared workspace role. */
  employeeId: string;
  sessionVersion: number;
  role: BtbRole;
}

/**
 * Resolve a personal BTB employee session for the location platform.
 *
 * The shared role accounts (BTB_ACCOUNTS) deliberately cannot enter: they carry
 * no employee id and no credential version, so location membership and
 * per-person attribution would have nothing to check. Every platform route
 * starts here and then lets the transactional SQL functions re-verify the
 * session version and location membership.
 */
export async function platformActor(): Promise<PlatformActor> {
  const { db, identity } = await requireBtbAccess("platform", false, { allowLocationWorkspace: true });
  if (!identity.employeeId || !identity.sessionVersion) {
    throw new BtbApiError("Sign in with your individual employee account to use the location workspace.", 401);
  }
  return { db, employeeId: identity.employeeId, sessionVersion: identity.sessionVersion, role: identity.role };
}

/**
 * Call a transactional platform function. The SQL functions are the real
 * authorization boundary: they re-check the actor, the credential version, the
 * capability and the location membership. SQLSTATE 42501 (denied) and 40001
 * (stale version) therefore surface as 403/409 instead of a generic 503.
 */
export async function platformRpc<T>(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw platformFailure(error.message ?? "", error.code, fallback);
  return data as T;
}

export const platformFailure = publicPlatformFailure;
