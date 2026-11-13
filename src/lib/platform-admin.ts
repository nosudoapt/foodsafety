import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Standalone platform-owner access: separate from the FoodSafe admin roles and
// the BTB workspace. One passcode (PLATFORM_ADMIN_PASSCODE env var), exchanged
// for an httpOnly cookie whose value is the SHA-256 of the passcode itself —
// so the cookie never carries the secret and rotation invalidates sessions.

export const PLATFORM_COOKIE = "platform_admin";

export function platformPasscode(): string | null {
  const value = process.env.PLATFORM_ADMIN_PASSCODE;
  return value && value.trim() ? value.trim() : null;
}

export function platformToken(): string | null {
  const passcode = platformPasscode();
  return passcode ? createHash("sha256").update(passcode).digest("hex") : null;
}

export function hasPlatformSession(cookieValue: string | undefined | null): boolean {
  const token = platformToken();
  if (!token || !cookieValue) return false;
  const given = Buffer.from(cookieValue);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
