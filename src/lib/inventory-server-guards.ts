import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
function unavailable(cause: unknown, message: string): DbGuardResult {
  return { ok: false, status: 500, error: message, cause };
}

export type DbGuardResult =
  | { ok: true }
  | { ok: false; status: 409 | 500; error: string; cause?: unknown };

/** A finalized month is immutable until a manager explicitly reopens it. */
export async function requireEditableMonth(db: SupabaseClient, month: string, locationId: string): Promise<DbGuardResult> {
  const { data, error } = await db
    .from("inventory_month_snapshots")
    .select("status")
    .eq("location_id", locationId)
    .eq("count_month", month)
    .maybeSingle();

  if (error) return unavailable(error, "The month status could not be checked. Please retry.");
  if (data?.status === "finalized") {
    return { ok: false, status: 409, error: "month is finalized; reopen it before making changes" };
  }
  return { ok: true };
}

/**
 * Changing/deleting an item that participates in a finalized month would make
 * a later correction recompute historical closing value with a new price (or
 * remove the count through ON DELETE CASCADE). Block it; add a new item instead.
 */
export async function requireItemWithoutFinalizedHistory(
  db: SupabaseClient,
  itemId: string,
  locationId: string,
): Promise<DbGuardResult> {
  const { data: counts, error: countError } = await db
    .from("inventory_counts")
    .select("count_month")
    .eq("location_id", locationId)
    .eq("item_id", itemId);

  if (countError) return unavailable(countError, "The item history could not be checked. Please retry.");
  const months = [...new Set((counts ?? []).map((row) => String(row.count_month)))];
  if (months.length === 0) return { ok: true };

  const { data: finalized, error: snapshotError } = await db
    .from("inventory_month_snapshots")
    .select("count_month")
    .eq("location_id", locationId)
    .eq("status", "finalized")
    .in("count_month", months)
    .limit(1);

  if (snapshotError) {
    return unavailable(snapshotError, "The finalized history could not be checked. Please retry.");
  }
  if ((finalized ?? []).length > 0) {
    return {
      ok: false,
      status: 409,
      error: "item is used by a finalized month and cannot be edited or deleted",
    };
  }
  return { ok: true };
}
