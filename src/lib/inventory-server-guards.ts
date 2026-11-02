import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DbGuardResult =
  | { ok: true }
  | { ok: false; status: 409 | 500; error: string };

/** A finalized month is immutable until a manager explicitly reopens it. */
export async function requireEditableMonth(db: SupabaseClient, month: string): Promise<DbGuardResult> {
  const { data, error } = await db
    .from("inventory_month_snapshots")
    .select("status")
    .eq("count_month", month)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: `could not check month status: ${error.message}` };
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
): Promise<DbGuardResult> {
  const { data: counts, error: countError } = await db
    .from("inventory_counts")
    .select("count_month")
    .eq("item_id", itemId);

  if (countError) return { ok: false, status: 500, error: `could not check item history: ${countError.message}` };
  const months = [...new Set((counts ?? []).map((row) => String(row.count_month)))];
  if (months.length === 0) return { ok: true };

  const { data: finalized, error: snapshotError } = await db
    .from("inventory_month_snapshots")
    .select("count_month")
    .eq("status", "finalized")
    .in("count_month", months)
    .limit(1);

  if (snapshotError) {
    return { ok: false, status: 500, error: `could not check finalized history: ${snapshotError.message}` };
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
