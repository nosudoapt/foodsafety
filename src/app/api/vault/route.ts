import { NextResponse, type NextRequest } from "next/server";
import { requireVaultSession } from "@/lib/vault-server";
import { encryptSecret, isEncrypted } from "@/lib/vault-crypto";

const LIST_COLUMNS = "id, service, category, username, secret, url, notes";

type VaultRow = {
  id: string;
  service: string;
  category: string;
  username: string | null;
  secret: string | null;
  url: string | null;
  notes: string | null;
};

export async function GET() {
  const auth = await requireVaultSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { data, error } = await auth.session.supabase
    .from("login_vault")
    .select(LIST_COLUMNS)
    .order("service");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const entries = ((data ?? []) as VaultRow[]).map((row) => ({
    id: row.id,
    service: row.service,
    category: row.category,
    username: row.username,
    url: row.url,
    notes: row.notes ?? "",
    hasSecret: row.secret !== null && row.secret !== "",
  }));

  const plaintextCount = ((data ?? []) as VaultRow[]).filter(
    (row) => row.secret && !isEncrypted(row.secret)
  ).length;

  return NextResponse.json({ entries, plaintextCount });
}

export async function POST(request: NextRequest) {
  const auth = await requireVaultSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.service !== "string" || !body.service.trim()) {
    return NextResponse.json({ error: "Service name is required." }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  let stored: string | null = null;
  if (secret) {
    try {
      stored = encryptSecret(secret);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Encryption failed." },
        { status: 500 }
      );
    }
  }

  const { data, error } = await auth.session.supabase
    .from("login_vault")
    .insert({
      restaurant_name: auth.session.restaurantName,
      service: body.service.trim(),
      category: body.category ?? "other",
      username: body.username ? String(body.username) : null,
      secret: stored,
      url: body.url ? String(body.url) : null,
      notes: body.notes ?? "",
    })
    .select("id, service, category, username, url, notes")
    .single();

  if (error) {
    // 23514 = the category CHECK predates this file (see
    // supabase/schema-vault-categories.sql) and rejected the new label.
    const message =
      error.code === "23514"
        ? "That category needs supabase/schema-vault-categories.sql run against the database."
        : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const entry = data as {
    id: string;
    service: string;
    category: string;
    username: string | null;
    url: string | null;
    notes: string | null;
  };

  return NextResponse.json({
    entry: { ...entry, notes: entry.notes ?? "", hasSecret: Boolean(stored) },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireVaultSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { error } = await auth.session.supabase.from("login_vault").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
