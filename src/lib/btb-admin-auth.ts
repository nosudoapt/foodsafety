// SERVER-ONLY: never import this module from a client component. The console
// has its own credentials, cookie, payload prefix AND signing-key context.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError } from "./api-errors";
import { BtbConfigurationError } from "./btb-auth";
import { isEmail, isUuid, isVersion } from "./btb-team";
import { verifyEmployeePassword } from "./btb-passwords";
import type { BtbAdminIdentity } from "./btb-admin";

export const BTB_ADMIN_COOKIE = "btb_admin_session";
export const BTB_ADMIN_MAX_AGE = 60 * 60 * 12;
export interface BtbAdminClaims { id: string; version: number; expires: number }

export function btbAdminSigningKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new BtbConfigurationError("The BTB console backend connection is not configured.");
  return createHmac("sha256", key).update("btb-admin-session-signing:v1").digest("hex");
}

export function btbAdminSessionValueFor(admin: Omit<BtbAdminClaims, "expires">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...admin, expires: Math.floor(now / 1000) + BTB_ADMIN_MAX_AGE })).toString("base64url");
  const signature = createHmac("sha256", btbAdminSigningKey()).update(`btb-admin:${payload}`).digest("hex");
  return `admin.${payload}.${signature}`;
}

export function btbAdminClaimsFromSession(value: string | null | undefined, now = Date.now()): BtbAdminClaims | null {
  if (!value || value.length > 1024) return null;
  const [prefix, payload, signature, extra] = value.split(".");
  if (prefix !== "admin" || !payload || !/^[a-f0-9]{64}$/.test(signature ?? "") || extra) return null;
  const expected = createHmac("sha256", btbAdminSigningKey()).update(`btb-admin:${payload}`).digest("hex");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as BtbAdminClaims;
    if (!isUuid(claims.id) || !isVersion(claims.version) || claims.version < 1
      || !Number.isSafeInteger(claims.expires) || claims.expires <= Math.floor(now / 1000)) return null;
    return claims;
  } catch { return null; }
}

function consoleDbError(error: { code?: string } | null) {
  if (error) throw new BtbApiError("The BTB console is not available. Ask your administrator to check the console migrations, then retry.", 503, error);
}

/** Cryptographic validity is not authorization: status/version is re-read. */
export async function btbAdminIdentityFromSession(value: string | null | undefined, db: SupabaseClient): Promise<BtbAdminIdentity | null> {
  const claims = btbAdminClaimsFromSession(value);
  if (!claims) return null;
  const result = await db.from("btb_super_admins").select("id,email,name,active,session_version").eq("id", claims.id).maybeSingle();
  consoleDbError(result.error);
  const admin = result.data;
  if (!admin?.active || admin.session_version !== claims.version) return null;
  return { id: admin.id, name: admin.name, email: admin.email, sessionVersion: admin.session_version };
}

/** Only the separate admin table is consulted, never shared/demo credentials. */
export async function authenticateBtbAdmin(db: SupabaseClient, email: string, password: string): Promise<BtbAdminIdentity> {
  email = email.trim().toLowerCase();
  if (!isEmail(email) || email.endsWith("@btb.demo") || !password || password.length > 128) throw new BtbApiError("Invalid email or password", 401);
  const limit = await db.rpc("btb_consume_admin_attempt", { p_key: createHash("sha256").update(email).digest("hex") });
  consoleDbError(limit.error);
  if (limit.data !== true) throw new BtbApiError("Too many sign-in attempts. Wait 15 minutes and try again.", 429);
  const result = await db.from("btb_super_admins").select("id,email,name,password_hash,active,session_version").eq("email", email).maybeSingle();
  consoleDbError(result.error);
  const admin = result.data;
  const valid = await verifyEmployeePassword(password, admin?.password_hash ?? null);
  if (!valid || !admin?.active) throw new BtbApiError("Invalid email or password", 401);
  // Check the version again before signing, including a concurrent reset/block.
  const login = await db.from("btb_super_admins").update({ last_login_at: new Date().toISOString() })
    .eq("id", admin.id).eq("active", true).eq("session_version", admin.session_version)
    .select("id,email,name,session_version").maybeSingle();
  consoleDbError(login.error);
  if (!login.data) throw new BtbApiError("Invalid email or password", 401);
  return { id: login.data.id, email: login.data.email, name: login.data.name, sessionVersion: login.data.session_version };
}
