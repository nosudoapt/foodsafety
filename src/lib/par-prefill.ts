// PAR prefill for the Daily Prep and Order Sheet pages — pure helpers so the
// same "what was PAR last time?" logic is shared and unit-testable.
//
// Policy: prefer the most recent entry from the SAME WEEKDAY (matches how the
// client counts week-over-week); fall back to the most recent entry overall.

export interface ParSnapshot {
  par: number;
  urgent: boolean;
}

export interface ParPrefillRow {
  item_name: string;
  /** ISO date (YYYY-MM-DD) of the historical row. */
  date: string;
  par: number;
  urgent?: boolean | null;
}

// Noon local time sidesteps DST/UTC edge cases when deriving the weekday.
function dowOf(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}

/**
 * Build per-item lookup maps from rows ordered newest-first (order by date
 * desc, created_at desc). First row seen per item wins.
 */
export function buildParMaps(
  rows: ParPrefillRow[],
  today: string,
): { latest: Map<string, ParSnapshot>; sameDow: Map<string, ParSnapshot> } {
  const dow = dowOf(today);
  const latest = new Map<string, ParSnapshot>();
  const sameDow = new Map<string, ParSnapshot>();
  for (const r of rows) {
    const snap: ParSnapshot = { par: Number(r.par) || 0, urgent: !!r.urgent };
    if (!latest.has(r.item_name)) latest.set(r.item_name, snap);
    if (dowOf(r.date) === dow && !sameDow.has(r.item_name)) sameDow.set(r.item_name, snap);
  }
  return { latest, sameDow };
}

/** Same-weekday snapshot if one exists, otherwise the most recent one. */
export function parFor(
  maps: { latest: Map<string, ParSnapshot>; sameDow: Map<string, ParSnapshot> },
  item: string,
): ParSnapshot | undefined {
  return maps.sameDow.get(item) ?? maps.latest.get(item);
}
