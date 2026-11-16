import { NextResponse } from "next/server";
import { requireVaultSession } from "@/lib/vault-server";
import { encryptSecret, isEncrypted } from "@/lib/vault-crypto";
import { databaseFailure } from "@/lib/btb-api";

export async function POST() {
  const auth = await requireVaultSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { data, error } = await auth.session.supabase
    .from("login_vault")
    .select("id, secret")
    .not("secret", "is", null);

  if (error) return databaseFailure(error, "Vault entries could not be checked. Please retry.", 503, auth.session.restaurantName);

  const rows: { id: string; secret: string | null }[] = data ?? [];
  const plaintext = rows.filter((row) => row.secret && !isEncrypted(row.secret));

  let updated = 0;
  for (const row of plaintext) {
    const { error: updateError } = await auth.session.supabase
      .from("login_vault")
      .update({ secret: encryptSecret(row.secret as string) })
      .eq("id", row.id);
    if (updateError) {
      return databaseFailure(updateError, `Vault hardening stopped after ${updated} entries. Retry to encrypt the remaining entries.`, 503, auth.session.restaurantName);
    }
    updated += 1;
  }

  return NextResponse.json({ updated, scanned: rows.length });
}
