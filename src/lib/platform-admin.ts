import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Standalone platform-owner access: separate from the FoodSafe admin roles and
// the BTB workspace. The passcode lives in the database (platform_auth,
// SHA-256 hash only — never the plaintext). A PLATFORM_ADMIN_PASSCODE env
// var, when set, overrides it. The first passcode may only be claimed with
// a one-time PLATFORM_ADMIN_BOOTSTRAP_TOKEN from the server environment;
// anonymous claiming is not possible. DB access lives in the API route
// files — this module stays crypto-only so the privileged client is only
// ever imported by routes.

export const PLATFORM_COOKIE = "platform_admin";

export const hashOf = (passcode: string) => createHash("sha256").update(passcode).digest("hex");

export function matchesPasscode(hash: string | null, passcode: string): boolean {
  if (!hash) return false;
  const given = Buffer.from(hashOf(passcode));
  const expected = Buffer.from(hash);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Verify a passcode attempt against a stored hash (null = not set up yet).
 * Returns "ok", "claim" (nothing stored — a bootstrap token is required) or "wrong". */
export function verifyAgainst(hash: string | null, passcode: string): "ok" | "claim" | "wrong" {
  if (!hash) return "claim";
  return matchesPasscode(hash, passcode) ? "ok" : "wrong";
}

/** Constant-time check of a one-time bootstrap token from the environment.
 * Returns false when no token is configured, so a missing env can never
 * authorize a claim. */
export function matchesBootstrapToken(token: string | undefined | null): boolean {
  const expected = process.env.PLATFORM_ADMIN_BOOTSTRAP_TOKEN?.trim();
  if (!expected || !token) return false;
  const given = Buffer.from(token);
  const right = Buffer.from(expected);
  return given.length === right.length && timingSafeEqual(given, right);
}

/** The cookie value is the SHA-256 of the stored hash, so rotating the
 * passcode in the DB invalidates old sessions automatically. */
export const cookieTokenFor = (hash: string) => hash;
