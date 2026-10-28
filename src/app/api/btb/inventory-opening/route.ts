import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";
import { prevMonth } from "@/lib/month-end-inventory";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) return NextResponse.json({ error: "missing month" }, { status: 400 });
  const pm = prevMonth(month);
  const { data } = await supabase.from("inventory_month_snapshots").select("closing_value, count_month").eq("count_month", pm).maybeSingle();
  if (!data) return NextResponse.json({ opening: null, source: null, baseline: month <= "2025-09" ? true : false });
  return NextResponse.json({ opening: Number(data.closing_value), source: pm });
}
