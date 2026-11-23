// SERVER-ONLY: token generation and credential writes never belong in a client.
// Kept free of Next runtime imports so the security logic can be unit-tested.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError } from "./api-errors";
import { hashEmployeePassword, validEmployeePassword } from "./btb-passwords";
import { isBtbInviteRole, type BtbInvitationInfo } from "./btb-admin";
import { isUuid, isVersion } from "./btb-team";

const INVALID_LINK = "This invitation is invalid, expired or already used. Ask your administrator for a new link.";
export const validInvitationToken = (token: unknown): token is string => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
export const invitationTokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

export function createBtbInvitation(origin: string, name: string, location: string) {
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new BtbApiError("Open invitations from your BTB console.");
  const token = randomBytes(32).toString("hex");
  const link = new URL("/auth/set-password", base.origin);
  link.searchParams.set("token", token);
  return { tokenHash: invitationTokenHash(token), link: link.href,
    subject: "Your Between the Buns workspace invitation",
    body: `Hi ${name},\n\nYou’ve been invited to the Between the Buns workspace at ${location}.\n\nSet your own password using this single-use link (valid for seven days):\n${link.href}\n\nAlready have a BTB employee password? This link replaces it and signs out older employee sessions. Your account is the same across assigned locations.\n\nAfter setup, sign in at ${base.origin}/auth/sign-in with your employee email. Shared demo and console passwords are separate.\n\nIf you weren’t expecting this invitation, contact your administrator.`,
  };
}

export async function lookupBtbInvitation(db: SupabaseClient, token: unknown): Promise<BtbInvitationInfo> {
  if (!validInvitationToken(token)) throw new BtbApiError(INVALID_LINK, 410);
  const result = await db.rpc("btb_invitation_lookup", { p_token_hash: invitationTokenHash(token) });
  if (result.error) throw new BtbApiError("Invitations are temporarily unavailable. Please try again.", 503, result.error);
  if (!result.data) throw new BtbApiError(INVALID_LINK, 410);
  // Explicit projection: even an accidental RPC expansion cannot expose ids or hashes.
  const { name, email, location, expires_at } = result.data as BtbInvitationInfo;
  return { name, email, location, expires_at };
}

export async function acceptBtbInvitation(db: SupabaseClient, token: unknown, password: unknown) {
  if (!validEmployeePassword(password)) throw new BtbApiError("Choose a password between 10 and 128 characters.");
  await lookupBtbInvitation(db, token);
  const tokenHash = invitationTokenHash(token as string);
  const limit = await db.rpc("btb_consume_login_attempt", { p_key: invitationTokenHash(`invitation:${tokenHash}`) });
  if (limit.error) throw new BtbApiError("Password setup is temporarily unavailable. Please try again.", 503, limit.error);
  if (limit.data !== true) throw new BtbApiError("Too many setup attempts. Wait 15 minutes and try again.", 429);
  const passwordHash = await hashEmployeePassword(password);
  const result = await db.rpc("btb_invitation_consume", { p_token_hash: tokenHash, p_password_hash: passwordHash });
  if (result.error) throw new BtbApiError(result.error.code === "22023" ? INVALID_LINK : "Password setup could not be completed. Please try again.", result.error.code === "22023" ? 410 : 503, result.error);
  const person = result.data as { id: string; role: unknown; name: string; session_version: number } | null;
  if (!person || !isUuid(person.id) || !isBtbInviteRole(person.role) || !isVersion(person.session_version) || person.session_version < 1) throw new BtbApiError("The server returned an incomplete setup result. Try signing in with your new password.", 503);
  return { id: person.id, role: person.role, name: person.name, version: person.session_version };
}
