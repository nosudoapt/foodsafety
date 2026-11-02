import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { verifiedBtbRole as roleFromSession } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { isMonthKey, prevMonth, toLines, totalValue, type InventoryCount, type InventoryItem } from "@/lib/month-end-inventory";
import { computeAccounting } from "@/lib/inventory-accounting";
import { persistWithAudit, snapshotRestoreFields, type SnapshotRow } from "@/lib/inventory-audit-persist";
import { nextSnapshotVersion, parseOptionalSales } from "@/lib/btb-inventory-api";
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
  const { data: items, error: itemError } = await db
    .from("inventory_items")
    .select("id, name, unit, category, unit_cost, position");
  if (itemError) throw new Error(`could not read inventory items: ${itemError.message}`);

  const { data: counts, error: countError } = await db
    .from("inventory_counts")
    .select("item_id, qty")
    .eq("count_month", month);
  if (countError) throw new Error(`could not read inventory counts: ${countError.message}`);

  const lines = toLines(
    ((items ?? []) as InventoryItem[]),
    ((counts ?? []) as InventoryCount[]),
  );
  return totalValue(lines);
}

// Recompute eligible monthly purchases from the ledger (single source of truth).
async function serverPurchases(db: SupabaseClient, month: string): Promise<number> {
  const { data, error } = await db
    .from("inventory_purchases")
    .select("amount")
    .eq("count_month", month);
  if (error) throw new Error(`could not read inventory purchases: ${error.message}`);
  const sum = (data ?? []).reduce((total, row) => {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("stored purchase amount is invalid");
    return total + amount;
  }, 0);
  return Math.round(sum * 100) / 100;
}

// Opening inventory = the immediately-preceding month's FINALIZED closing only.
async function serverOpening(
  db: SupabaseClient,
  month: string,
): Promise<{ opening: number | null; priorDraft: boolean }> {
  const pm = prevMonth(month);
  const { data, error } = await db
    .from("inventory_month_snapshots")
    .select("closing_value, status")
    .eq("count_month", pm)
    .maybeSingle();
  if (error) throw new Error(`could not read prior snapshot: ${error.message}`);
  if (!data) return { opening: null, priorDraft: false }; // first period / missing immediate prior
  if (data.status !== "finalized") return { opening: null, priorDraft: true };
  const closing = Number(data.closing_value);
  if (!Number.isFinite(closing) || closing < 0) throw new Error("prior snapshot closing value is invalid");
  return { opening: Math.round(closing * 100) / 100, priorDraft: false };
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = await roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!MANAGER_ROLES.includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { count_month, sales } = body ?? {};
  if (!isMonthKey(count_month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const db = inventoryDb();

  // The FULL existing row (not just status): a rollback needs it to restore a
  // reopened draft, or to know there was no prior row at all.
  const { data: existing, error: existingError } = await db
    .from("inventory_month_snapshots")
    .select("*")
    .eq("count_month", count_month)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing && existing.status === "finalized") {
    return NextResponse.json({ error: "already finalized" }, { status: 409 });
  }
  const prior = (existing ?? null) as SnapshotRow | null;

  // Recompute everything from persisted records — never trust the browser.
  let closing: number;
  let purchases: number;
  let openingResult: { opening: number | null; priorDraft: boolean };
  try {
    [closing, purchases, openingResult] = await Promise.all([
      serverClosingValue(db, count_month),
      serverPurchases(db, count_month),
      serverOpening(db, count_month),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "could not read persisted accounting data" },
      { status: 500 },
    );
  }

  if (openingResult.priorDraft) {
    return NextResponse.json(
      { error: `prior month ${prevMonth(count_month)} is reopened; re-finalize it first` },
      { status: 409 },
    );
  }
  const opening = openingResult.opening;

  // Refuse to finalize an empty/invalid month (no counted value at all).
  if (closing <= 0 && purchases <= 0) {
    return NextResponse.json({ error: "no inventory data to finalize" }, { status: 400 });
  }

  // Food sales: the one manual figure. Validate, never fabricate.
  const parsedSales = parseOptionalSales(sales);
  if (!parsedSales.ok) return NextResponse.json({ error: parsedSales.error }, { status: 400 });
  const s = parsedSales.value;

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
    finalized_at: new Date().toISOString(),
    version: nextSnapshotVersion(prior),
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
        snapshot: written,
        version: written.version ?? row.version ?? 1,
      });
      return { error };
    },
    rollback: async (written) => {
      if (prior) {
        // Re-finalize of a reopened draft: put the draft back exactly.
        const { data, error } = await db
          .from("inventory_month_snapshots")
          .update(snapshotRestoreFields(prior))
          .eq("count_month", count_month)
          .eq("status", "finalized")
          .eq("version", written.version ?? row.version ?? 1)
          .eq("finalized_at", written.finalized_at ?? row.finalized_at)
          .select("count_month")
          .maybeSingle();
        return { error: error ?? (data ? null : { message: "snapshot changed concurrently; rollback was not applied" }) };
      }
      // First finalize: remove the snapshot we just created.
      const { data, error } = await db
        .from("inventory_month_snapshots")
        .delete()
        .eq("count_month", count_month)
        .eq("status", "finalized")
        .eq("version", written.version ?? row.version ?? 1)
        .eq("finalized_at", written.finalized_at ?? row.finalized_at)
        .select("count_month")
        .maybeSingle();
      return { error: error ?? (data ? null : { message: "snapshot changed concurrently; rollback was not applied" }) };
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
