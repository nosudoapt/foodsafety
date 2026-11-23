import { createHmac, timingSafeEqual } from "node:crypto";
import { AUTH_ROLES, PRINCIPAL_TYPES, WORKSPACE_MAX_AGE, authSlug, authUuid, authVersion, type WorkspaceClaims } from "./workspace-auth-types";

const DOMAIN = "workspace-session:v1:";
export function signWorkspaceSession(claims: WorkspaceClaims, key: string | Buffer): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", key).update(DOMAIN + payload).digest("base64url");
  return `w1.${payload}.${signature}`;
}

/** Signature validation is only the first gate. The server also checks the
 * durable session, live principal version/status and same-tenant assignments. */
export function verifyWorkspaceSession(value: string | null | undefined, key: string | Buffer, now = Date.now()): WorkspaceClaims | null {
  if (!value || value.length > 3900) return null;
  const [prefix, payload, signature, extra] = value.split(".");
  if (prefix !== "w1" || !payload || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature ?? "") || extra) return null;
  const expected = createHmac("sha256", key).update(DOMAIN + payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WorkspaceClaims;
    const seconds = Math.floor(now / 1000);
    if (!authUuid(claims.sub) || !authUuid(claims.sid) || !authUuid(claims.tenantId) || !authUuid(claims.locationId)
      || !authSlug(claims.tenantSlug) || !authVersion(claims.version)
      || !(PRINCIPAL_TYPES as readonly string[]).includes(claims.principalType)
      || !(AUTH_ROLES as readonly string[]).includes(claims.role)
      || !Array.isArray(claims.allowedLocationIds) || !claims.allowedLocationIds.length || claims.allowedLocationIds.length > 40
      || !claims.allowedLocationIds.every(authUuid) || !claims.allowedLocationIds.includes(claims.locationId)
      || new Set(claims.allowedLocationIds).size !== claims.allowedLocationIds.length
      || typeof claims.permittedView !== "string" || !/^\/(dashboard|admin(?:\/marketing)?|trial-expired|btb\/[a-z0-9-]+)$/.test(claims.permittedView)
      || !Number.isSafeInteger(claims.exp) || claims.exp <= seconds || claims.exp > seconds + WORKSPACE_MAX_AGE) return null;
    return claims;
  } catch { return null; }
}
