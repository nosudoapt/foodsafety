import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { databaseFailure, legacyBtbRole as roleFromSession } from "@/lib/btb-api";
import { btbInventoryRoute, type BtbInventoryScope } from "@/lib/btb-inventory-route";

export const GET = btbInventoryRoute(readOpening);
import { inventoryDb } from "@/lib/supabase-server";
import { isMonthKey, prevMonth } from "@/lib/month-end-inventory";
import { resolveOpening } from "@/lib/inventory-accounting";

// Opening inventory for a month = the IMMEDIATELY preceding month's FINALIZED
// closing snapshot. A draft count, a missing month, or an unfinalised prior
// month all yield `opening: null` (unavailable) — never zero, never a skipped
// month, never a fabricated baseline. Any signed-in role may read.
async function readOpening(scope: BtbInventoryScope, req: Request) {
  const locationId = scope.location.id;
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
    .eq("location_id", locationId)
    .eq("count_month", pm)
    .maybeSingle();
  if (error) return databaseFailure(error);

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
