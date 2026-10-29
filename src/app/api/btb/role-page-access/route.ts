import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { inventoryDb } from "@/lib/supabase-server";

// Role → page access matrix the BTB hub reads. Any signed-in role may read it
// (the hub uses it to show/hide cards); only admin may change it. The GET used
// to have NO cookie check at all — anyone could read the matrix unauthenticated.

const ALL_ROLES = ["staff", "supervisor", "manager", "corporate", "admin"];

export async function GET() {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role || !ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data, error } = await inventoryDb().from("role_page_access").select("role, page, allowed");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { role: targetRole, page, allowed } = body ?? {};
  if (!targetRole || !page) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await inventoryDb().from("role_page_access").upsert({ role: targetRole, page, allowed: !!allowed }, { onConflict: "role,page" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
