import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";
import { isMonthKey, prevMonth, toLines, totalValue, type InventoryCount, type InventoryItem } from "@/lib/month-end-inventory";
import { computeAccounting, safeQty } from "@/lib/inventory-accounting";

// Finalize a month: recompute every accounting figure from TRUSTED persisted
// records (count sheet × item costs, the purchase ledger, and the prior
// month's FINALIZED closing) and write an immutable snapshot. The browser only
// supplies the month key and the one genuinely-manual figure — food sales.
// Manager/Admin only; never trusts client-submitted totals or roles.

const MANAGER_ROLES = ["manager", "admin"];

// Recompute the closing inventory value for a month straight from the stored
// count sheet: Σ (qty × item.unit_cost). Ignores anything the browser claims.
async function serverClosingValue(month: string): Promise<number> {
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, unit, category, unit_cost, position");
  const { data: counts } = await supabase
    .from("inventory_counts")
    .select("item_id, qty")
    .eq("count_month", month);
  const lines = toLines(
    ((items ?? []) as InventoryItem[]),
    ((counts ?? []) as InventoryCount[]).map((c) => ({ ...c, qty: safeQty(c.qty) })),
  );
  return totalValue(lines);
}

// Recompute eligible monthly purchases from the ledger (single source of truth).
async function serverPurchases(month: string): Promise<number> {
  const { data } = await supabase
    .from("inventory_purchases")
    .select("amount")
    .eq("count_month", month);
  const sum = (data ?? []).reduce((s, r) => s + safeQty(r.amount), 0);
  return Math.round(sum * 100) / 100;
}

// Opening inventory = the immediately-preceding month's FINALIZED closing only.
async function serverOpening(month: string): Promise<number | null> {
  const pm = prevMonth(month);
  const { data } = await supabase
    .from("inventory_month_snapshots")
    .select("closing_value, status")
    .eq("count_month", pm)
    .maybeSingle();
  if (!data || data.status !== "finalized") return null; // baseline / unfinalised prior
  return safeQty(data.closing_value);
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!MANAGER_ROLES.includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { count_month, sales } = body ?? {};
  if (!isMonthKey(count_month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  // A finalized snapshot for this month must not already exist (no silent overwrite).
  const { data: existing } = await supabase
    .from("inventory_month_snapshots")
    .select("count_month, status")
    .eq("count_month", count_month)
    .maybeSingle();
  if (existing && existing.status === "finalized") {
    return NextResponse.json({ error: "already finalized" }, { status: 409 });
  }

  // Recompute everything from persisted records — never trust the browser.
  const closing = await serverClosingValue(count_month);
  const purchases = await serverPurchases(count_month);
  const opening = await serverOpening(count_month);

  // Refuse to finalize an empty/invalid month (no counted value at all).
  if (closing <= 0 && purchases <= 0) {
    return NextResponse.json({ error: "no inventory data to finalize" }, { status: 400 });
  }

  // Food sales: the one manual figure. Validate, never fabricate.
  const s = sales == null || sales === "" ? null : safeQty(sales);
  if (sales != null && sales !== "" && !Number.isFinite(Number(sales))) {
    return NextResponse.json({ error: "invalid sales" }, { status: 400 });
  }

  const acct = computeAccounting({ opening, purchases, closing, sales: s });

  const row = {
    count_month,
    opening_value: opening ?? 0,           // baseline month → 0 stored, flagged below
    closing_value: closing,
    purchases,
    sales: s,
    cogs: acct.cogs,
    food_cost_pct: acct.foodCostPct,
    status: "finalized",
    finalized_by: role,
  };

  const { data: written, error } = await supabase
    .from("inventory_month_snapshots")
    .upsert(row, { onConflict: "count_month" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit the figures at action time (append-only).
  await supabase.from("inventory_audit_log").insert({
    count_month,
    action: "finalize",
    actor: role,
    snapshot: row,
    version: written?.version ?? 1,
  });

  return NextResponse.json({
    ok: true,
    snapshot: written,
    baseline: opening === null,
    status: acct.status,
    flags: acct.flags,
  });
}
