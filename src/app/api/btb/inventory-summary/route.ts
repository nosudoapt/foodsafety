import { NextResponse } from "next/server";
import { databaseFailure } from "@/lib/btb-api";
import { btbInventoryRoute, type BtbInventoryScope } from "@/lib/btb-inventory-route";

export const POST = btbInventoryRoute(saveSummary);
import { inventoryDb } from "@/lib/supabase-server";
import { MONTH_END_EDIT_ROLES, parseSummarySave } from "@/lib/btb-inventory-api";
import { requireEditableMonth } from "@/lib/inventory-server-guards";
import { replaceRows } from "@/lib/persist-replace";

// Food-sales summary — previously saved DIRECTLY from the browser via the anon
// key (month-end-inventory/page.tsx lines 165-181). Manager/admin only
// (edit-MGR_ONLY). Only sales are stored here: opening carries forward from
// the prior finalized snapshot and purchases come from the ledger, so neither
// is hand-typed. Replace-with-restore, same non-atomicity disclosure as the
// count sheet save.

async function saveSummary(scope: BtbInventoryScope, req: Request) {
  const locationId = scope.location.id;
  const body = await req.json().catch(() => ({}));
  const parsed = parseSummarySave(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { count_month: month, sales } = parsed.value;

  const db = inventoryDb();
  const editable = await requireEditableMonth(db, month, locationId);
  if (!editable.ok) return databaseFailure(editable.cause, editable.error, editable.status);

  const outcome = await replaceRows({
    label: "sales save",
    backup: async () => {
      const { data, error } = await db
        .from("inventory_month_summary")
        .select("*")
        .eq("location_id", locationId)
        .eq("count_month", month);
      return { rows: (data ?? []) as Record<string, unknown>[], error };
    },
    del: async () => {
      const { error } = await db.from("inventory_month_summary").delete().eq("location_id", locationId).eq("count_month", month);
      return { error };
    },
    ins: async () => {
      const { data, error } = await db
        .from("inventory_month_summary")
        .insert({ count_month: month, sales, location_id: locationId })
        .select("id");
      return { inserted: data?.length ?? 0, error };
    },
    restore: async (oldRows) => {
      const { error } = await db.from("inventory_month_summary").insert(oldRows as Record<string, unknown>[]);
      return { error };
    },
  });

  if (!outcome.ok) return databaseFailure(outcome, outcome.message);
  return NextResponse.json({ ok: true });
}
