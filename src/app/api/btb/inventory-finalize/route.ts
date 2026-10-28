import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (role !== "manager" && role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { count_month, opening_value, closing_value, purchases, sales } = body ?? {};
  if (!count_month || typeof closing_value !== "number") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  // Prevent overwrite: check existing
  const { data: existing } = await supabase.from("inventory_month_snapshots").select("count_month").eq("count_month", count_month).maybeSingle();
  if (existing) return NextResponse.json({ error: "already finalized" }, { status: 409 });

  const o = Number(opening_value) || 0;
  const c = Number(closing_value) || 0;
  const p = Number(purchases) || 0;
  const s = sales == null ? null : Number(sales);
  const cogs = Math.round((o + p - c) * 100) / 100;
  const fcp = s && s > 0 ? Math.round((cogs / s) * 1000) / 10 : null;

  const { error } = await supabase.from("inventory_month_snapshots").insert({
    count_month, opening_value: o, closing_value: c, purchases: p, sales: s, cogs, food_cost_pct: fcp, finalized_by: role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
