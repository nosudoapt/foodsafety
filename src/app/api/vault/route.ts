import { vaultRoute } from "@/lib/vault-server";
import { encryptSecret, isEncrypted } from "@/lib/vault-crypto";
import { BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { uploadText } from "@/lib/btb-uploader";
import { VAULT_CATEGORIES, LEGACY_VAULT_CATEGORIES } from "@/lib/vault-categories";

const LIST_COLUMNS = "id, service, category, username, secret, url, notes";
type VaultRow = { id: string; service: string; category: string; username: string | null; secret: string | null; url: string | null; notes: string | null };

export const GET = vaultRoute(false, async ({ supabase, restaurantName }) => {
  const { data, error } = await supabase.from("login_vault").select(LIST_COLUMNS).eq("restaurant_name", restaurantName).order("service");
  dbError(error, "Vault entries could not be loaded. Please retry.");
  const rows = (data ?? []) as VaultRow[];
  return {
    entries: rows.map(({ secret, ...row }) => ({ ...row, notes: row.notes ?? "", hasSecret: Boolean(secret) })),
    plaintextCount: rows.filter(row => row.secret && !isEncrypted(row.secret)).length,
  };
});

export const POST = vaultRoute(true, async ({ supabase, restaurantName }, request) => {
  const body = await readBody(request, 16_384);
  const service = uploadText(body.service, "a service name", 200, true);
  const category = body.category ?? "other";
  if (typeof category !== "string" || ![...VAULT_CATEGORIES, ...LEGACY_VAULT_CATEGORIES].some(item => item.value === category)) throw new BtbApiError("Choose a valid vault category.");
  const secret = uploadText(body.secret ?? "", "a password or PIN", 2000);
  let stored: string | null = null;
  if (secret) {
    try { stored = encryptSecret(secret); }
    catch (error) { throw new BtbApiError("Encryption is unavailable. Ask your administrator to check the vault configuration.", 503, error); }
  }
  const result = await supabase.from("login_vault").insert({
    restaurant_name: restaurantName, service, category, secret: stored,
    username: uploadText(body.username ?? "", "a username", 300) || null,
    url: uploadText(body.url ?? "", "a login URL", 2000) || null,
    notes: uploadText(body.notes ?? "", "notes", 2000),
  }).select("id,service,category,username,url,notes").single();
  if (result.error?.code === "23514") throw new BtbApiError("That category needs supabase/schema-vault-categories.sql run against the database.", 400, result.error);
  dbError(result.error, "The vault entry could not be saved. Please retry.");
  return { entry: { ...result.data, notes: result.data?.notes ?? "", hasSecret: Boolean(stored) } };
});

export const DELETE = vaultRoute(true, async ({ supabase, restaurantName }, request) => {
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) throw new BtbApiError("Choose a saved vault entry.");
  const result = await supabase.from("login_vault").delete().eq("restaurant_name", restaurantName).eq("id", id).select("id").maybeSingle();
  dbError(result.error, "The vault entry could not be deleted. Please retry.");
  if (!result.data) throw new BtbApiError("Entry not found or unavailable.", 404);
  return { ok: true };
});
