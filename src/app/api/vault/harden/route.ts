import { NextResponse } from "next/server";
import { requireVaultSession } from "@/lib/vault-server";
import { encryptSecret, isEncrypted } from "@/lib/vault-crypto";

export async function POST() {
  const auth = await requireVaultSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { data, error } = await auth.session.supabase
    .from("login_vault")
    .select("id, secret")
    .not("secret", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows: { id: string; secret: string | null }[] = data ?? [];
  const plaintext = rows.filter((row) => row.secret && !isEncrypted(row.secret));

  let updated = 0;
  for (const row of plaintext) {
    const { error: updateError } = await auth.session.supabase
      .from("login_vault")
      .update({ secret: encryptSecret(row.secret as string) })
      .eq("id", row.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message, updated }, { status: 400 });
    }
    updated += 1;
  }

  return NextResponse.json({ updated, scanned: rows.length });
}
