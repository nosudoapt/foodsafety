import { NextResponse, type NextRequest } from "next/server";
import { requireVaultSession } from "@/lib/vault-server";
import { decryptSecret } from "@/lib/vault-crypto";

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
    return NextResponse.json({ error: error?.message ?? "Entry not found." }, { status: 404 });
  }

  try {
    return NextResponse.json({ secret: decryptSecret(data.secret ?? "") });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to decrypt entry." },
      { status: 500 }
    );
  }
}
