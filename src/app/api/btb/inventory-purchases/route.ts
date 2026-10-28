import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // purchase entry allowed for manager/supervisor/corporate/admin; staff read-only
  if (!["manager", "supervisor", "corporate", "admin"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { count_month, purchase_date, type, supplier, description, amount, reference, notes } = body ?? {};
  if (!count_month || !purchase_date || !description || typeof amount !== "number") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (type !== "gfs" && type !== "local") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  const { data, error } = await supabase.from("inventory_purchases").insert({
    count_month, purchase_date, type, supplier: supplier ?? null, description, amount, reference: reference ?? null, notes: notes ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchase: data });
}
