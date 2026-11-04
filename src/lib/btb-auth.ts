// Between the Buns (BTB) auth — a SEPARATE credential store from the green
// FoodSafe demo. Deliberately not Supabase: BTB is a different business with
// its own shared store-tablet login, and must stay decoupled from the demo.
//
// Five shared role accounts remain available for store-wide access. Individual
// employee credentials are verified through BTB's server-only tables, independent
// of Supabase Auth. Signed personal cookies bind the employee and credential
// version; protected requests re-check the account through ./btb-api.
//
// SERVER-ONLY: this module holds the password and session token. Client code
// must import ./btb-roles instead (see the guard test in tests/btb-auth.test.ts).
import { createHmac, timingSafeEqual } from "node:crypto";
import { BTB_ROLES, isBtbRole, type BtbRole } from "./btb-roles";
import { isEmployeeRole, isUuid, isVersion, type EmployeeRole } from "./btb-team";

export { BTB_ROLES, isBtbRole };
export type { BtbRole };

export const BTB_COOKIE = "btb_session";

// Cookie lifetime for a signed-in store tablet (30 days).
export const BTB_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const BTB_EMPLOYEE_MAX_AGE = 60 * 60 * 12;

export interface BtbAccount {
  role: BtbRole;
  email: string;
  name: string;
  restaurant: string;
}

// One account per role. "manager" covers managers and owners (one tier);
// "supervisor" sits between staff and manager.
export const BTB_ACCOUNTS: readonly BtbAccount[] = [
  { role: "corporate", email: "corporate@foodsafe.demo", name: "Morgan Blake", restaurant: "Grill House Group" },
  { role: "manager", email: "manager@foodsafe.demo", name: "Jordan Patel", restaurant: "The Grill House" },
  { role: "supervisor", email: "supervisor@foodsafe.demo", name: "Riley Nguyen", restaurant: "The Grill House" },
  { role: "staff", email: "staff@foodsafe.demo", name: "Sam Rivera", restaurant: "The Grill House" },
  { role: "admin", email: "admin@foodsafe.demo", name: "Admin User", restaurant: "Grill House Group" },
] as const;

export function btbAccountFor(role: string): BtbAccount | undefined {
  return BTB_ACCOUNTS.find((a) => a.role === role);
}

// Backend-owned credentials for the five shared role workspaces. Keep the
// existing login working in development and production without login env vars.
// Individual employee passwords remain hashed in the backend database.
export function btbPassword(): string {
  return "admin1234";
}

// Local-development convenience only; the live login never returns a password.
export function btbPasswordIsDefault(): boolean {
  return process.env.NODE_ENV !== "production";
}

// The backend already requires this private database credential. Derive a
// separate, stable signing key from it so all server instances agree without
// a BTB_SESSION_TOKEN setting or a public, hard-coded production signing key.
// Rotating the backend credential also invalidates existing BTB sessions.
export function btbSessionToken(): string {
  const backendKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (backendKey) return createHmac("sha256", backendKey).update("btb-session-signing:v1").digest("hex");
  if (process.env.NODE_ENV === "production") {
    throw new BtbConfigurationError("The server's existing Supabase backend connection is not configured.");
  }
  return "btb-dev-session-token";
}

/** Configuration failures are safe to surface as a generic 503 at login. */
export class BtbConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtbConfigurationError";
  }
}

// Constant-time-ish equality to avoid trivially leaking length/early-exit.
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Returns the signed-in account, or null. Credentials are matched against
// BTB_ACCOUNTS only — never against Supabase or the green demo.
export function accountForCredentials(email: string, password: string): BtbAccount | null {
  if (!safeEqual(password, btbPassword())) return null;
  const account = BTB_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase()
  );
  return account ?? null;
}

// Cookie value is "<role>.<HMAC(role)>". The server secret itself is NEVER put
// in the cookie. A staff cookie therefore cannot be escalated by replacing the
// role prefix with "manager" — the signature no longer matches.
function sessionSignature(role: BtbRole): string {
  return createHmac("sha256", btbSessionToken()).update(`btb-session:${role}`).digest("hex");
}

export function sessionValueFor(role: BtbRole): string {
  return `${role}.${sessionSignature(role)}`;
}

export function roleFromSession(value: string | undefined | null): BtbRole | null {
  if (!value) return null;
  if (value.startsWith("employee.")) return employeeClaimsFromSession(value)?.role ?? null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null; // also rejects the old, role-less token format
  const role = value.slice(0, dot);
  const token = value.slice(dot + 1);
  if (!isBtbRole(role)) return null;
  return safeEqual(token, sessionSignature(role)) ? role : null;
}

export function tokenValid(value: string | undefined | null): boolean {
  return roleFromSession(value) !== null;
}

export interface EmployeeSessionClaims { id: string; role: EmployeeRole; version: number; expires: number }

/** The signature binds the employee, role, credential version and expiry. */
export function employeeSessionValueFor(employee: Omit<EmployeeSessionClaims, "expires">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...employee, expires: Math.floor(now / 1000) + BTB_EMPLOYEE_MAX_AGE })).toString("base64url");
  const signature = createHmac("sha256", btbSessionToken()).update(`btb-employee:${payload}`).digest("hex");
  return `employee.${payload}.${signature}`;
}

export function employeeClaimsFromSession(value: string | undefined | null, now = Date.now()): EmployeeSessionClaims | null {
  if (!value || value.length > 1024) return null;
  const [prefix, payload, signature, extra] = value.split(".");
  if (prefix !== "employee" || !payload || !signature || extra) return null;
  const expected = createHmac("sha256", btbSessionToken()).update(`btb-employee:${payload}`).digest("hex");
  if (!safeEqual(signature, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as EmployeeSessionClaims;
    if (!isUuid(claims.id) || !isEmployeeRole(claims.role) || !isVersion(claims.version) || !Number.isInteger(claims.expires) || claims.expires <= Math.floor(now / 1000)) return null;
    return claims;
  } catch { return null; }
}
