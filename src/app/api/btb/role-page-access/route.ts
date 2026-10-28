import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase.from("role_page_access").select("role, page, allowed");
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
  const { error } = await supabase.from("role_page_access").upsert({ role: targetRole, page, allowed: !!allowed }, { onConflict: "role,page" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
