// Monthly food-cost accounting — pure helpers shared by the month-end page,
// the finalize/reopen APIs and the tests. One source of truth for:
//
//   COGS         = Opening + Purchases − Closing
//   Food Cost %  = (COGS ÷ Food Sales) × 100
//
// Every figure is derived from trusted, persisted records (the prior month's
// FINALIZED closing snapshot, the purchase ledger, and the counted closing
// value). Missing inputs are never silently replaced with zero — they surface
// as `null` plus an explicit status/flag so the UI can show "unavailable"
// instead of a misleading number.

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Free-typed / stored qty → a rounded, non-negative number (junk → 0). */
export function safeQty(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(n);
}

/** A stored amount that may legitimately be absent. null stays null. */
export function nullableAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

/**
 * Whether a month is the very first tracked period (a baseline). There is no
 * prior finalized snapshot to carry forward, so opening inventory is unknown —
 * never fabricated as zero.
 */
export interface OpeningSource {
  /** Prior month key whose finalized closing we may carry forward. */
  sourceMonth: string | null;
  /** The prior month's finalized closing value, or null when unavailable. */
  closing: number | null;
}

/**
 * Resolve a month's opening inventory from the immediately-preceding month's
 * FINALIZED snapshot only. Draft counts, missing months, or an unfinalised
 * prior month all yield `null` — never zero, never a skipped month.
 */
export function resolveOpening(
  prior: OpeningSource | null | undefined,
): { opening: number | null; carriedFrom: string | null; baseline: boolean } {
  if (!prior || prior.closing === null || prior.sourceMonth === null) {
    return { opening: null, carriedFrom: null, baseline: true };
  }
  return { opening: safeQty(prior.closing), carriedFrom: prior.sourceMonth, baseline: false };
}

/** Accounting lifecycle for a month, from the data that exists for it. */
export type AccountingStatus =
  | "finalized"     // a finalized snapshot exists and is displayed as-is
  | "complete"      // every draft input present → COGS + food cost % available
  | "no_opening"    // baseline month / prior month not finalized → no opening
  | "no_closing"    // closing count not entered yet
  | "no_sales"      // food sales not entered yet
  | "zero_sales"    // sales entered as 0 → % undefined
  | "empty";        // nothing entered at all

export interface AccountingInputs {
  /** Opening inventory ($). null = unavailable (baseline / unfinalised prior). */
  opening: number | null;
  /** Eligible monthly purchases ($) summed from the purchase ledger. */
  purchases: number | null;
  /** Closing inventory ($), the counted+valued total. null = not counted. */
  closing: number | null;
  /** Food sales ($) for the same period. null = not entered. */
  sales: number | null;
}

export interface AccountingFlags {
  /** COGS came out negative — impossible without a data error; review. */
  negativeCogs: boolean;
  /** Food cost % outside a plausible band (0–100+); review. */
  suspiciousPct: boolean;
}

export interface AccountingResult {
  cogs: number | null;
  foodCostPct: number | null;
  status: AccountingStatus;
  flags: AccountingFlags;
}

/** Plausible food-cost % upper bound before we flag it for review. */
export const FOOD_COST_PCT_FLAG = 100;

/**
 * Compute COGS and food-cost % with explicit, non-fabricated null handling.
 *
 * - Missing opening (baseline month) → `no_opening`, cogs/pct are null.
 * - Missing closing → `no_closing`, cogs/pct are null.
 * - Missing sales → `no_sales`, cogs still computed, pct null.
 * - Sales exactly 0 → `zero_sales`, pct null (never divide by zero).
 * - Negative COGS or an out-of-band % sets a review flag but still returns
 *   the number so the Manager can see and correct it.
 */
export function computeAccounting(input: AccountingInputs): AccountingResult {
  const opening = nullableAmount(input.opening);
  const purchases = nullableAmount(input.purchases) ?? 0;
  const closing = nullableAmount(input.closing);
  const sales = nullableAmount(input.sales);

  const nothingEntered =
    opening === null && closing === null && sales === null && (nullableAmount(input.purchases) ?? 0) === 0;

  let status: AccountingStatus;
  let cogs: number | null = null;
  let pct: number | null = null;

  if (nothingEntered) {
    status = "empty";
  } else if (opening === null) {
    // Baseline month (or prior month not finalized): opening is unknown.
    status = "no_opening";
  } else if (closing === null) {
    status = "no_closing";
  } else {
    cogs = round2(opening + purchases - closing);
    if (sales === null) {
      status = "no_sales";
    } else if (sales === 0) {
      status = "zero_sales";
    } else {
      pct = round1((cogs / sales) * 100);
      status = "complete";
    }
  }

  const flags: AccountingFlags = {
    negativeCogs: cogs !== null && cogs < 0,
    suspiciousPct: pct !== null && (pct < 0 || pct > FOOD_COST_PCT_FLAG),
  };

  return { cogs, foodCostPct: pct, status, flags };
}

/**
 * The numeric acceptance fixture from the spec:
 *   opening 5000 + purchases 2000 − closing 4000 = COGS 3000
 *   3000 ÷ 12000 × 100 = 25%
 */
export const ACCOUNTING_FIXTURE: AccountingInputs = {
  opening: 5000,
  purchases: 2000,
  closing: 4000,
  sales: 12000,
};
