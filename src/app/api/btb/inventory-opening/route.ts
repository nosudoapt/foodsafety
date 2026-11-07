import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { legacyBtbRole as roleFromSession } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { isMonthKey, prevMonth } from "@/lib/month-end-inventory";
import { resolveOpening } from "@/lib/inventory-accounting";

// Opening inventory for a month = the IMMEDIATELY preceding month's FINALIZED
// closing snapshot. A draft count, a missing month, or an unfinalised prior
// month all yield `opening: null` (unavailable) — never zero, never a skipped
// month, never a fabricated baseline. Any signed-in role may read.
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const role = await roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const pm = prevMonth(month);
  const { data, error } = await inventoryDb()
    .from("inventory_month_snapshots")
    .select("closing_value, status, count_month")
    .is("location_id", null)
    .eq("count_month", pm)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resolved = resolveOpening(
    data && data.status === "finalized"
      ? { sourceMonth: pm, closing: Number(data.closing_value) }
      : null,
  );

  return NextResponse.json({
    opening: resolved.opening,
    carriedFrom: resolved.carriedFrom,
    baseline: resolved.baseline,
  });
}
