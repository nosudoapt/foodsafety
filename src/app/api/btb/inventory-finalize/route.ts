import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { inventoryDb } from "@/lib/supabase-server";
import { isMonthKey, prevMonth, toLines, totalValue, type InventoryCount, type InventoryItem } from "@/lib/month-end-inventory";
import { computeAccounting, safeQty } from "@/lib/inventory-accounting";
import { persistWithAudit, snapshotRestoreFields, type SnapshotRow } from "@/lib/inventory-audit-persist";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finalize a month: recompute every accounting figure from TRUSTED persisted
// records (count sheet × item costs, the purchase ledger, and the prior
// month's FINALIZED closing) and write an immutable snapshot. The browser only
// supplies the month key and the one genuinely-manual figure — food sales.
// Manager/Admin only; never trusts client-submitted totals or roles.
//
// Snapshot + audit write go through persistWithAudit: the audit error is
// checked and a failed audit write rolls the snapshot back, so this endpoint
// never reports success while leaving an unaudited snapshot.

const MANAGER_ROLES = ["manager", "admin"];

// Recompute the closing inventory value for a month straight from the stored
// count sheet: Σ (qty × item.unit_cost). Ignores anything the browser claims.
async function serverClosingValue(db: SupabaseClient, month: string): Promise<number> {
  const { data: items } = await db
    .from("inventory_items")
    .select("id, name, unit, category, unit_cost, position");
  const { data: counts } = await db
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
async function serverPurchases(db: SupabaseClient, month: string): Promise<number> {
  const { data } = await db
    .from("inventory_purchases")
    .select("amount")
    .eq("count_month", month);
  const sum = (data ?? []).reduce((s, r) => s + safeQty(r.amount), 0);
  return Math.round(sum * 100) / 100;
}

// Opening inventory = the immediately-preceding month's FINALIZED closing only.
async function serverOpening(db: SupabaseClient, month: string): Promise<number | null> {
  const pm = prevMonth(month);
  const { data } = await db
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

  const db = inventoryDb();

  // The FULL existing row (not just status): a rollback needs it to restore a
  // reopened draft, or to know there was no prior row at all.
  const { data: existing } = await db
    .from("inventory_month_snapshots")
    .select("*")
    .eq("count_month", count_month)
    .maybeSingle();
  if (existing && existing.status === "finalized") {
    return NextResponse.json({ error: "already finalized" }, { status: 409 });
  }
  const prior = (existing ?? null) as SnapshotRow | null;

  // Recompute everything from persisted records — never trust the browser.
  const closing = await serverClosingValue(db, count_month);
  const purchases = await serverPurchases(db, count_month);
  const opening = await serverOpening(db, count_month);

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

  const row: SnapshotRow = {
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

  const outcome = await persistWithAudit<SnapshotRow>(count_month, {
    actionLabel: "finalization",
    writeSnapshot: async () => {
      const { data, error } = await db
        .from("inventory_month_snapshots")
        .upsert(row, { onConflict: "count_month" })
        .select()
        .single();
      return { data: (data as SnapshotRow | null) ?? null, error };
    },
    writeAudit: async (written) => {
      const { error } = await db.from("inventory_audit_log").insert({
        count_month,
        action: "finalize",
        actor: role,
        snapshot: row,
        version: written?.version ?? 1,
      });
      return { error };
    },
    rollback: async () => {
      if (prior) {
        // Re-finalize of a reopened draft: put the draft back exactly.
        const { error } = await db
          .from("inventory_month_snapshots")
          .update(snapshotRestoreFields(prior))
          .eq("count_month", count_month);
        return { error };
      }
      // First finalize: remove the snapshot we just created.
      const { error } = await db
        .from("inventory_month_snapshots")
        .delete()
        .eq("count_month", count_month);
      return { error };
    },
  });

  if (!outcome.ok) {
    // recovered=false needs a human; recovered=true is a clean rollback.
    return NextResponse.json({ error: outcome.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    snapshot: outcome.snapshot,
    baseline: opening === null,
    status: acct.status,
    flags: acct.flags,
  });
}
