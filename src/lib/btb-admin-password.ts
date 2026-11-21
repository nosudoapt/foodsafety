import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError } from "./api-errors";
import type { BtbAdminIdentity } from "./btb-admin";
import { hashEmployeePassword, validEmployeePassword, verifyEmployeePassword } from "./btb-passwords";

function consoleDbError(error: { code?: string } | null) {
  if (error) throw new BtbApiError("The BTB console is not available. Ask your administrator to check the console migrations, then retry.", 503, error);
}

/**
 * Rotates the console credential. The update is version-guarded, so a concurrent
 * reset/block wins and this call fails closed. Bumping session_version invalidates
 * every other console cookie; the caller must re-issue the current one.
 */
export async function changeBtbAdminPassword(
  db: SupabaseClient,
  admin: BtbAdminIdentity,
  currentPassword: string,
  newPassword: string,
): Promise<{ sessionVersion: number }> {
  if (!validEmployeePassword(newPassword)) throw new BtbApiError("Use a new password of 10 to 128 characters.");
  const current = await db.from("btb_super_admins").select("password_hash").eq("id", admin.id).maybeSingle();
  consoleDbError(current.error);
  if (!await verifyEmployeePassword(currentPassword, current.data?.password_hash ?? null)) {
    throw new BtbApiError("Your current console password is incorrect.");
  }
  const passwordHash = await hashEmployeePassword(newPassword);
  const updated = await db.from("btb_super_admins")
    .update({ password_hash: passwordHash, session_version: admin.sessionVersion + 1 })
    .eq("id", admin.id).eq("active", true).eq("session_version", admin.sessionVersion)
    .select("session_version").maybeSingle();
  consoleDbError(updated.error);
  if (!updated.data) throw new BtbApiError("Your console session changed. Sign in again, then retry.", 409);
  return { sessionVersion: updated.data.session_version };
}
