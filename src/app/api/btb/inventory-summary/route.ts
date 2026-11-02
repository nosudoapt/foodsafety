import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { verifiedBtbRole as roleFromSession } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { MONTH_END_EDIT_ROLES, parseSummarySave, requireRole } from "@/lib/btb-inventory-api";
import { requireEditableMonth } from "@/lib/inventory-server-guards";
import { replaceRows } from "@/lib/persist-replace";

// Food-sales summary — previously saved DIRECTLY from the browser via the anon
// key (month-end-inventory/page.tsx lines 165-181). Manager/admin only
// (edit-MGR_ONLY). Only sales are stored here: opening carries forward from
// the prior finalized snapshot and purchases come from the ledger, so neither
// is hand-typed. Replace-with-restore, same non-atomicity disclosure as the
// count sheet save.

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(await roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = parseSummarySave(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { count_month: month, sales } = parsed.value;

  const db = inventoryDb();
  const editable = await requireEditableMonth(db, month);
  if (!editable.ok) return NextResponse.json({ error: editable.error }, { status: editable.status });

  const outcome = await replaceRows({
    label: "sales save",
    backup: async () => {
      const { data, error } = await db
        .from("inventory_month_summary")
        .select("*")
        .eq("count_month", month);
      return { rows: (data ?? []) as Record<string, unknown>[], error };
    },
    del: async () => {
      const { error } = await db.from("inventory_month_summary").delete().eq("count_month", month);
      return { error };
    },
    ins: async () => {
      const { data, error } = await db
        .from("inventory_month_summary")
        .insert({ count_month: month, sales, location_id: null })
        .select("id");
      return { inserted: data?.length ?? 0, error };
    },
    restore: async (oldRows) => {
      const { error } = await db.from("inventory_month_summary").insert(oldRows as Record<string, unknown>[]);
      return { error };
    },
  });

  if (!outcome.ok) return NextResponse.json({ error: outcome.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
