// Daily purchase ledger helpers for month-end inventory.
// Pure functions shared by the UI and tests. One source of truth: eligible
// purchase transactions for the selected month.

export type PurchaseType = "gfs" | "local";

export interface PurchaseEntry {
  id?: string;
  count_month: string; // YYYY-MM
  purchase_date: string; // YYYY-MM-DD
  type: PurchaseType;
  supplier?: string | null;
  description: string;
  amount: number;
  reference?: string | null;
  notes?: string | null;
  cash_out_id?: string | null;
  counted_by?: string | null;
}

export function daysInMonth(month: string): number {
  if (!/^\d{4}-\d{2}$/.test(month)) return 0;
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthDates(month: string): string[] {
  const n = daysInMonth(month);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    out.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export function entryAmount(e: PurchaseEntry): number {
  const n = Number(e.amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function dailyTotal(entries: readonly PurchaseEntry[], date: string): number {
  return Math.round(entries.filter((e) => e.purchase_date === date).reduce((s, e) => s + entryAmount(e), 0) * 100) / 100;
}

export function monthlyTotal(entries: readonly PurchaseEntry[], type?: PurchaseType): number {
  const filtered = type ? entries.filter((e) => e.type === type) : entries;
  return Math.round(filtered.reduce((s, e) => s + entryAmount(e), 0) * 100) / 100;
}

export function isDuplicateInvoice(entries: readonly PurchaseEntry[], candidate: PurchaseEntry): boolean {
  if (candidate.type !== "gfs") return false;
  const ref = (candidate.reference ?? "").trim().toLowerCase();
  const sup = (candidate.supplier ?? "").trim().toLowerCase();
  if (!ref && !sup) return false;
  return entries.some((e) => {
    if (e.type !== "gfs") return false;
    if (e.id && candidate.id && e.id === candidate.id) return false;
    const r = (e.reference ?? "").trim().toLowerCase();
    const s = (e.supplier ?? "").trim().toLowerCase();
    return ref !== "" && r === ref && (sup === "" || s === sup);
  });
}
