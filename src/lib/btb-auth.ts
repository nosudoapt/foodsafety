// Between the Buns (BTB) auth — a SEPARATE credential store from the green
// FoodSafe demo. Deliberately not Supabase: BTB is a different business with
// its own shared store-tablet login, and must stay decoupled from the demo.
//
// Four role accounts share one password (the emails happen to match the green
// demo's for convenience — they are checked here, against this list, and never
// against Supabase). The session cookie carries the role so the hub can show
// each job its own cards.
//
// SERVER-ONLY: this module holds the password and session token. Client code
// must import ./btb-roles instead (see the guard test in tests/btb-auth.test.ts).
import { BTB_ROLES, isBtbRole, type BtbRole } from "./btb-roles";

export { BTB_ROLES, isBtbRole };
export type { BtbRole };

export const BTB_COOKIE = "btb_session";

// Cookie lifetime for a signed-in store tablet (30 days).
export const BTB_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export interface BtbAccount {
  role: BtbRole;
  email: string;
  name: string;
  restaurant: string;
}

export const BTB_ACCOUNTS: readonly BtbAccount[] = [
  { role: "owner", email: "owner@foodsafe.demo", name: "Avery Chen", restaurant: "The Grill House" },
  { role: "manager", email: "manager@foodsafe.demo", name: "Jordan Patel", restaurant: "The Grill House" },
  { role: "staff", email: "staff@foodsafe.demo", name: "Sam Rivera", restaurant: "The Grill House" },
  { role: "corporate", email: "corporate@foodsafe.demo", name: "Morgan Blake", restaurant: "Grill House Group" },
] as const;

export function btbAccountFor(role: string): BtbAccount | undefined {
  return BTB_ACCOUNTS.find((a) => a.role === role);
}

// Shared password for all four BTB accounts (one store password, as chosen).
// Same value as the green demo's DEMO_PASSWORD, so owner@… + admin1234 works
// on whichever sign-in page you use. Override with BTB_PASSWORD; the default
// matches the login screen's hint and supabase/seed-demo.sql.
export function btbPassword(): string {
  return process.env.BTB_PASSWORD || "admin1234";
}

// True only while the default password is in use — lets the login screen show
// the hint without ever leaking a password that has been overridden.
export function btbPasswordIsDefault(): boolean {
  return !process.env.BTB_PASSWORD;
}

export function btbSessionToken(): string {
  return process.env.BTB_SESSION_TOKEN || "btb-dev-session-token";
}

// Constant-time-ish equality to avoid trivially leaking length/early-exit.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

// Cookie value is "<role>.<server-side token>" — the role is only ever
// trusted because the token half is secret (BTB_SESSION_TOKEN, server-side).
export function sessionValueFor(role: BtbRole): string {
  return `${role}.${btbSessionToken()}`;
}

export function roleFromSession(value: string | undefined | null): BtbRole | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null; // also rejects the old, role-less token format
  const role = value.slice(0, dot);
  const token = value.slice(dot + 1);
  if (!isBtbRole(role)) return null;
  return safeEqual(token, btbSessionToken()) ? role : null;
}

export function tokenValid(value: string | undefined | null): boolean {
  return roleFromSession(value) !== null;
}
