// Server-only helpers for the demo accounts. Do NOT import this from any
// "use client" file — it is where the shared demo password lives, and it must
// stay out of the browser bundle. Client code identifies demo sessions by
// email (see isDemoEmail) and asks /api/demo/session to sign in.
import { DEMO_ACCOUNTS, isDemoRole } from "./demo-roles";

// Shared demo password for every seeded demo account. One password across
// both surfaces (this and BTB's admin1234) — same email, same credential,
// whichever sign-in page you land on. Override with DEMO_PASSWORD; the
// default matches supabase/seed-demo.sql.
export function demoPassword(): string {
  return process.env.DEMO_PASSWORD || "admin1234";
}

export interface DemoCredentials {
  email: string;
  password: string;
}

// Resolves a demo role to real Supabase credentials, or null when the role
// is not a seeded demo role (so callers can 400 instead of guessing).
export function demoCredentialsFor(role: unknown): DemoCredentials | null {
  if (!isDemoRole(role)) return null;
  const account = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!account) return null;
  return { email: account.email, password: demoPassword() };
}
