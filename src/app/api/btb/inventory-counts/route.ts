import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { inventoryDb } from "@/lib/supabase-server";
import { isMonthKey, prevMonth } from "@/lib/month-end-inventory";
import { MONTH_END_EDIT_ROLES, parseCountSave, requireRole } from "@/lib/btb-inventory-api";
import { replaceRows } from "@/lib/persist-replace";

// Count sheet — previously read/saved DIRECTLY from the browser via the anon
// key (month-end-inventory/page.tsx lines 79-93/232-249). Now server-side:
// any signed-in role reads (view-ALL), manager/admin saves (edit-MGR_ONLY).
//
// The save REPLACES a month's rows (delete-old → insert-new over independent
// PostgREST requests — not atomic). replaceRows() backs up the old rows first
// and restores them if the insert fails, so a failed save can no longer
// silently lose a month's counts (the old page deleted first and hoped).

const COUNT_COLS = "id, item_id, count_month, qty, counted_by, location_id";
const ALL_ROLES = ["staff", "supervisor", "manager", "corporate", "admin"];

// Read a month's counts, the previous month's counts (variance column) and
// the stored food-sales figure in one round trip.
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(roleFromSession(cookieStore.get(BTB_COOKIE)?.value), ALL_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const month = new URL(req.url).searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const db = inventoryDb();
  const [countsRes, prevRes, summaryRes] = await Promise.all([
    db.from("inventory_counts").select(COUNT_COLS).eq("count_month", month),
    db.from("inventory_counts").select(COUNT_COLS).eq("count_month", prevMonth(month)),
    db.from("inventory_month_summary").select("sales").eq("count_month", month),
  ]);
  if (countsRes.error) return NextResponse.json({ error: countsRes.error.message }, { status: 500 });
  if (prevRes.error) return NextResponse.json({ error: prevRes.error.message }, { status: 500 });
  if (summaryRes.error) return NextResponse.json({ error: summaryRes.error.message }, { status: 500 });

  const row = (summaryRes.data?.[0] as { sales: number } | undefined) ?? null;
  return NextResponse.json({
    counts: countsRes.data ?? [],
    prevCounts: prevRes.data ?? [],
    sales: row ? String(Number(row.sales) || 0) : "",
  });
}

// Save the count sheet for a month (replace semantics, restore-on-failure).
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = parseCountSave(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { count_month: month, rows, location_id } = parsed.value;

  // Same rule as the old page: only non-zero quantities are stored; saving an
  // empty sheet clears the month.
  const toInsert = rows
    .filter((r) => r.qty > 0)
    .map((r) => ({ item_id: r.item_id, count_month: month, qty: r.qty, location_id }));

  const db = inventoryDb();
  const outcome = await replaceRows({
    label: "count sheet save",
    backup: async () => {
      const { data, error } = await db
        .from("inventory_counts")
        .select("*")
        .eq("count_month", month);
      return { rows: (data ?? []) as Record<string, unknown>[], error };
    },
    del: async () => {
      const { error } = await db.from("inventory_counts").delete().eq("count_month", month);
      return { error };
    },
    ins: async () => {
      if (toInsert.length === 0) return { inserted: 0, error: null };
      const { data, error } = await db.from("inventory_counts").insert(toInsert).select("id");
      return { inserted: data?.length ?? 0, error };
    },
    restore: async (oldRows) => {
      const { error } = await db.from("inventory_counts").insert(oldRows as Record<string, unknown>[]);
      return { error };
    },
  });

  if (!outcome.ok) return NextResponse.json({ error: outcome.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: outcome.inserted });
}
