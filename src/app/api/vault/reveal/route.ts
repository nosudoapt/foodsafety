import { vaultRoute } from "@/lib/vault-server";
import { decryptSecret } from "@/lib/vault-crypto";
import { BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";

// Revealing a secret is a viewing operation, but still a same-origin POST.
export const POST = vaultRoute(false, async ({ supabase, restaurantName }, request) => {
  const body = await readBody(request, 4096);
  if (!isUuid(body.id)) throw new BtbApiError("Choose a saved vault entry.");
  const result = await supabase.from("login_vault").select("secret").eq("restaurant_name", restaurantName).eq("id", body.id).maybeSingle();
  dbError(result.error, "Entry not found or unavailable.");
  if (!result.data) throw new BtbApiError("Entry not found or unavailable.", 404);
  try { return { secret: decryptSecret(result.data.secret ?? "") }; }
  catch (error) { throw new BtbApiError("Unable to decrypt this entry. Ask your administrator to check the vault configuration.", 503, error); }
});
