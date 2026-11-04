import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError, dbError } from "./btb-api";
import { BTB_RESTAURANT } from "./btb-team";

/** The genuine, login-disabled identity provisioned by provision-btb-uploader.mjs.
 * Resolve it from the backend so this sheet needs no new environment settings.
 * Its profile owns the legacy FK; a concurrent FoodSafe login never owns BTB data.
 */
export async function temperatureOwner(db: SupabaseClient): Promise<string> {
  const email = "btb-uploader@foodsafe.invalid";
  const profile = await db.from("profiles").select("id").eq("email", email).eq("restaurant_name", BTB_RESTAURANT).eq("role", "staff").maybeSingle();
  dbError(profile.error, "Temperature storage could not be checked. Please retry.");
  if (!profile.data) throw new BtbApiError("Temperature storage is not connected. Ask your manager to finish the workspace setup.", 503);
  const result = await db.auth.admin.getUserById(profile.data.id);
  const user = result.data.user;
  const bannedUntil = user?.banned_until ? new Date(user.banned_until).getTime() : NaN;
  if (result.error || !user || user.id !== profile.data.id || user.email !== email || user.app_metadata?.btb_uploader !== true || !Number.isFinite(bannedUntil) || bannedUntil <= Date.now()) {
    throw new BtbApiError("Temperature storage could not be verified. Please retry or ask your manager to reconnect it.", 503);
  }
  return profile.data.id;
}
