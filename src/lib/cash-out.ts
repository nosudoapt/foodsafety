// Cash Out — end-of-day till math and the 30-day retention window. Pure
// helpers so the page and the tests agree on what each number means.

export interface CashOutDraft {
  /** ISO date (YYYY-MM-DD) of the shift being closed. */
  count_date: string;
  till_amount: number;
  cash_sale: number;
  delivery_fees: number;
  driver_tips: number;
  /** Amount handed over / dropped from the drawer. */
  cash_out: number;
  /** Amount moved to the safe. */
  safe_drop: number;
}

export interface CashOutRow extends CashOutDraft {
  id: string;
  created_by?: string | null;
  created_at?: string;
}

export const CASH_OUT_RETENTION_DAYS = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Form strings / NULLs → a number (blank and junk both count as 0). */
export function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/** Everything the form collects, normalised for save or maths. */
export function toDraft(input: {
  count_date: string;
  till_amount: string | number;
  cash_sale: string | number;
  delivery_fees: string | number;
  driver_tips: string | number;
  cash_out: string | number;
  safe_drop: string | number;
}): CashOutDraft {
  return {
    count_date: input.count_date,
    till_amount: round2(num(input.till_amount)),
    cash_sale: round2(num(input.cash_sale)),
    delivery_fees: round2(num(input.delivery_fees)),
    driver_tips: round2(num(input.driver_tips)),
    cash_out: round2(num(input.cash_out)),
    safe_drop: round2(num(input.safe_drop)),
  };
}

/** Cash that came across the counter: sales + delivery fees + driver tips. */
export const totalCashIn = (d: CashOutDraft): number =>
  round2(num(d.cash_sale) + num(d.delivery_fees) + num(d.driver_tips));

/** What actually left the drawer: the hand-over plus the safe drop. */
export const totalDropped = (d: CashOutDraft): number =>
  round2(num(d.cash_out) + num(d.safe_drop));

/** Still in the till after the drop — anything other than 0 wants a recount. */
export const tillLeft = (d: CashOutDraft): number =>
  round2(num(d.till_amount) - totalDropped(d));

/** A row with no numbers at all — not worth writing to the table. */
export const isEmptyDraft = (d: CashOutDraft): boolean =>
  [
    d.till_amount,
    d.cash_sale,
    d.delivery_fees,
    d.driver_tips,
    d.cash_out,
    d.safe_drop,
  ].every((v) => num(v) === 0);

/** Sums across a history window, for the totals row. */
export function totalsFor(rows: readonly CashOutDraft[]): CashOutDraft {
  return rows.reduce<CashOutDraft>(
    (acc, r) => ({
      count_date: acc.count_date,
      till_amount: round2(acc.till_amount + num(r.till_amount)),
      cash_sale: round2(acc.cash_sale + num(r.cash_sale)),
      delivery_fees: round2(acc.delivery_fees + num(r.delivery_fees)),
      driver_tips: round2(acc.driver_tips + num(r.driver_tips)),
      cash_out: round2(acc.cash_out + num(r.cash_out)),
      safe_drop: round2(acc.safe_drop + num(r.safe_drop)),
    }),
    { count_date: "", till_amount: 0, cash_sale: 0, delivery_fees: 0, driver_tips: 0, cash_out: 0, safe_drop: 0 },
  );
}

// --- date helpers (noon-local so DST never shifts the calendar day) ---
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`);

/** Local YYYY-MM-DD for a Date — toISOString() would jump across timezones. */
export function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Oldest date still kept: 30 days including today. */
export function retentionCutoff(today: string): string {
  const d = dayOf(today);
  d.setDate(d.getDate() - (CASH_OUT_RETENTION_DAYS - 1));
  return isoDay(d);
}

/** Inside the retention window (cutoff ≤ date ≤ today)? */
export function withinRetention(date: string, today: string): boolean {
  return date >= retentionCutoff(today) && date <= today;
}
