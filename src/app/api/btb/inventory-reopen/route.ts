import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";
import { nextMonth } from "@/lib/month-end-inventory";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (role !== "manager" && role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { count_month, reason } = body ?? {};
  if (!count_month) return NextResponse.json({ error: "missing month" }, { status: 400 });

  // Block if downstream month is finalized
  const nm = nextMonth(count_month);
  const { data: downstream } = await supabase.from("inventory_month_snapshots").select("count_month").eq("count_month", nm).maybeSingle();
  if (downstream) return NextResponse.json({ error: "downstream finalized; resolve first" }, { status: 409 });

  const { data: existing } = await supabase.from("inventory_month_snapshots").select("*").eq("count_month", count_month).maybeSingle();
  if (!existing) return NextResponse.json({ error: "not finalized" }, { status: 404 });

  await supabase.from("inventory_audit_log").insert({ count_month, action: "reopen", actor: role, reason: reason ?? null });
  await supabase.from("inventory_month_snapshots").delete().eq("count_month", count_month);
  return NextResponse.json({ ok: true });
}
