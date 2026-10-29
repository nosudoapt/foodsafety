import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";
import { isMonthKey } from "@/lib/month-end-inventory";

// Fetch a month's accounting snapshot (finalized, or reopened-draft). Any
// signed-in role may read. The UI shows finalized snapshots as-is and marks
// reopened months as draft so they can be corrected and re-finalized.
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const { data, error } = await supabase
    .from("inventory_month_snapshots")
    .select("*")
    .eq("count_month", month)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshot: data ?? null });
}
