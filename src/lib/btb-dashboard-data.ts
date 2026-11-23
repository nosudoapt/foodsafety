import type { SupabaseClient } from "@supabase/supabase-js";
import { btbAccessSummary, btbCountQuery, btbDateWindow, btbMetricIds, type BtbMetricId, type BtbOverview } from "./btb-dashboard";
import type { BtbPageAccess } from "./btb-page-access";
import type { BtbRole } from "./btb-roles";
import { queryExactCount } from "./query-count";

export async function loadBtbOverview(client: SupabaseClient, role: BtbRole, rows: BtbPageAccess[], day: string, signal: AbortSignal, grants: readonly string[] | null = null, legacy = true, locationId: string | null = null): Promise<BtbOverview> {
  const dates = btbDateWindow(day);
  if (!dates) throw new Error("Invalid dashboard date");
  const entries = await Promise.all(btbMetricIds(role, rows, grants, legacy).map(async (id): Promise<[BtbMetricId, number | string | null]> => {
    if (id === "inventoryStatus") {
      try {
        // Month-end inventory belongs to one branch; the legacy unowned rows are
        // only read when the caller has no branch (the shared demo).
        const snapshots = client.from("inventory_month_snapshots").select("status").eq("count_month", dates.inventoryMonth).abortSignal(signal);
        const { data, error } = await (locationId ? snapshots.eq("location_id", locationId) : snapshots.is("location_id", null)).maybeSingle();
        return [id, error ? null : data?.status === "finalized" ? "Finalized" : "Draft"];
      } catch { return [id, null]; }
    }
    const query = btbCountQuery(id, day);
    if (query && ["btb_shift_checks", "marketing_promotions", "social_media_calendar", "compliance_documents"].includes(query.table)) query.filters.push({ column: "location_id", op: "isNull" });
    return [id, query ? await queryExactCount(client, query.table, query.filters, signal) : null];
  }));
  return { values: { ...Object.fromEntries(entries), ...btbAccessSummary(role, rows, grants) }, updatedAt: new Date().toISOString(), day, inventoryMonth: dates.inventoryMonth };
}
