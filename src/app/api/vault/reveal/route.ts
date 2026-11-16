import { NextResponse, type NextRequest } from "next/server";
import { requireVaultSession } from "@/lib/vault-server";
import { decryptSecret } from "@/lib/vault-crypto";
import { databaseFailure } from "@/lib/btb-api";

export async function POST(request: NextRequest) {
  const auth = await requireVaultSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { data, error } = await auth.session.supabase
    .from("login_vault")
    .select("secret")
    .eq("id", id)
    .single();

  if (error || !data) {
    return databaseFailure(error, "Entry not found or unavailable.", 404, auth.session.restaurantName);
  }

  try {
    return NextResponse.json({ secret: decryptSecret(data.secret ?? "") });
  } catch (err) {
    return databaseFailure(err, "Unable to decrypt this entry. Ask your administrator to check the vault configuration.", 503, auth.session.restaurantName);
  }
}
