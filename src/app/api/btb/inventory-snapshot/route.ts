import { NextResponse } from "next/server";
import { databaseFailure } from "@/lib/btb-api";
import { btbInventoryRoute, type BtbInventoryScope } from "@/lib/btb-inventory-route";

export const GET = btbInventoryRoute(readSnapshot);
import { inventoryDb } from "@/lib/supabase-server";
import { isMonthKey } from "@/lib/month-end-inventory";

// Fetch a month's accounting snapshot (finalized, or reopened-draft). Any
// signed-in role may read. The UI shows finalized snapshots as-is and marks
// reopened months as draft so they can be corrected and re-finalized.
async function readSnapshot(scope: BtbInventoryScope, req: Request) {
  const locationId = scope.location.id;
  // The workspace session already resolved and authorized this branch.
  const role = scope.identity.role;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const { data, error } = await inventoryDb()
    .from("inventory_month_snapshots")
    .select("*")
    .eq("location_id", locationId)
    .eq("count_month", month)
    .maybeSingle();
  if (error) return databaseFailure(error);
  return NextResponse.json({ snapshot: data ?? null });
}
