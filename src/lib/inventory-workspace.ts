import { fetchJson } from "./fetch-json";
import { countQty, type InventoryCount, type InventoryItem } from "./month-end-inventory";
import type { PurchaseEntry } from "./inventory-purchases";
import { parseCountSave } from "./btb-inventory-api";

export interface InventorySnapshot {
  count_month: string;
  status: "draft" | "finalized";
  opening_value: number | null;
  closing_value: number;
  purchases: number;
  sales: number | null;
  cogs: number | null;
  food_cost_pct: number | null;
  version?: number;
  finalized_at?: string;
  reopen_reason?: string;
}

export interface InventoryMonthData {
  items: InventoryItem[];
  counts: InventoryCount[];
  prevCounts: InventoryCount[];
  sales: string;
  opening: { opening: number | null; carriedFrom: string | null; baseline: boolean };
  purchases: PurchaseEntry[];
  snapshot: InventorySnapshot | null;
}

/** All five sources must resolve before the month can be edited. In particular,
 * a failed snapshot/ledger read must never look like a new, empty draft. */
export async function loadInventoryMonth(month: string, signal: AbortSignal): Promise<InventoryMonthData> {
  const [items, counts, opening, purchases, snapshot] = await Promise.all([
    fetchJson<{ items: InventoryItem[] }>("/api/btb/inventory-items", { signal }),
    fetchJson<{ counts: InventoryCount[]; prevCounts: InventoryCount[]; sales: string }>(`/api/btb/inventory-counts?month=${month}`, { signal }),
    fetchJson<InventoryMonthData["opening"]>(`/api/btb/inventory-opening?month=${month}`, { signal }),
    fetchJson<{ purchases: PurchaseEntry[] }>(`/api/btb/inventory-purchases?month=${month}`, { signal }),
    fetchJson<{ snapshot: InventorySnapshot | null }>(`/api/btb/inventory-snapshot?month=${month}`, { signal }),
  ]);
  if (!Array.isArray(items.items) || !Array.isArray(counts.counts) || !Array.isArray(counts.prevCounts)
    || typeof counts.sales !== "string" || !Array.isArray(purchases.purchases)
    || typeof opening.baseline !== "boolean" || opening.opening === undefined || snapshot.snapshot === undefined) {
    throw new Error("The inventory response is incomplete. Please retry.");
  }
  if (items.items.some((item) => item.unit_cost == null || !Number.isFinite(Number(item.unit_cost)) || Number(item.unit_cost) < 0)
    || [...counts.counts, ...counts.prevCounts].some((item) => item.qty == null || !Number.isFinite(Number(item.qty)) || Number(item.qty) < 0)
    || (snapshot.snapshot && !["draft", "finalized"].includes(snapshot.snapshot.status))) {
    throw new Error("Some inventory records could not be read. Please retry.");
  }
  return {
    items: items.items.map((item) => ({ ...item, unit_cost: Number(item.unit_cost) })),
    counts: counts.counts.map((item) => ({ ...item, qty: countQty(item.qty) })),
    prevCounts: counts.prevCounts.map((item) => ({ ...item, qty: countQty(item.qty) })),
    sales: counts.sales, opening, purchases: purchases.purchases, snapshot: snapshot.snapshot,
  };
}

/** Send the actual entered values through the same validation as the API.
 * Blanks, negative values and malformed drafts must not silently become zero. */
export function inventoryCountPayload(month: string, items: InventoryItem[], stored: InventoryCount[], draft: Record<string, string>) {
  const counts = new Map(stored.map((item) => [item.item_id, item.qty]));
  return parseCountSave({ count_month: month, counts: items.map((item) => ({ item_id: item.id, qty: draft[item.id] ?? counts.get(item.id) ?? 0 })) });
}

export function changedInventoryCounts(stored: InventoryCount[], draft: Record<string, string>): number {
  const counts = new Map(stored.map((item) => [item.item_id, item.qty]));
  return Object.entries(draft).filter(([id, value]) => value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || countQty(value) !== (counts.get(id) ?? 0)).length;
}
