import { vaultRoute } from "@/lib/vault-server";
import { encryptSecret, isEncrypted } from "@/lib/vault-crypto";
import { BtbApiError, dbError } from "@/lib/btb-api";

export const POST = vaultRoute(true, async ({ supabase, restaurantName }) => {
  const result = await supabase.from("login_vault").select("id,secret").eq("restaurant_name", restaurantName).not("secret", "is", null);
  dbError(result.error, "Vault entries could not be checked. Please retry.");
  const rows: { id: string; secret: string | null }[] = result.data ?? [];
  let updated = 0;
  for (const row of rows.filter(row => row.secret && !isEncrypted(row.secret))) {
    let secret: string;
    try { secret = encryptSecret(row.secret as string); }
    catch (error) { throw new BtbApiError("Encryption is unavailable. Ask your administrator to check the vault configuration.", 503, error); }
    // Do not overwrite a secret edited while this batch was running.
    const saved = await supabase.from("login_vault").update({ secret }).eq("restaurant_name", restaurantName).eq("id", row.id).eq("secret", row.secret).select("id");
    dbError(saved.error, `Vault hardening stopped after ${updated} entries. Retry to encrypt the remaining entries.`);
    updated += saved.data?.length ?? 0;
  }
  return { updated, scanned: rows.length };
});
