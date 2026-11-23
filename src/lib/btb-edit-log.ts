import type { SupabaseClient } from "@supabase/supabase-js";

/** Owners and supervisors audit the sheets; managers and staff never see this. */
export const EDIT_LOG_ROLES = ["owner", "supervisor", "corporate"] as const;
export const EDIT_LOG_DAYS = 45;

export function canViewEditLog(role: string): boolean {
  return (EDIT_LOG_ROLES as readonly string[]).includes(role);
}

export interface EditEntry {
  tenant_id: string;
  location_id: string;
  area: "prep" | "order";
  sheet_date: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  section: string;
  item_name: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
}

type Cell = Record<string, string>;

const show = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text.slice(0, 200);
};

/**
 * Compares two item -> field maps and returns one readable entry per change.
 * A field present on only one side is treated as empty on the other, so
 * "not ticked" -> "ticked" and "0" -> "" both read correctly.
 */
export function diffSheet(
  before: Record<string, Cell>,
  after: Record<string, Cell>,
  base: Pick<EditEntry, "tenant_id" | "location_id" | "area" | "sheet_date" | "actor_id" | "actor_name" | "actor_role">,
  sectionOf: (item: string) => string,
): EditEntry[] {
  const entries: EditEntry[] = [];
  const items = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const item of items) {
    const fields = new Set([...Object.keys(before[item] ?? {}), ...Object.keys(after[item] ?? {})]);
    for (const field of fields) {
      const oldValue = show(before[item]?.[field]);
      const newValue = show(after[item]?.[field]);
      if (oldValue === newValue) continue;
      entries.push({ ...base, section: sectionOf(item), item_name: item.slice(0, 160), field, old_value: oldValue, new_value: newValue });
    }
  }
  return entries.slice(0, 400);
}

/** Audit writes never fail a save: the save already happened and is what matters. */
export async function recordEdits(db: SupabaseClient, entries: EditEntry[]): Promise<void> {
  if (!entries.length) return;
  const result = await db.from("btb_edit_log").insert(entries);
  if (result.error) {
    console.error(JSON.stringify({ event: "edit_log_failed", area: entries[0].area, count: entries.length, error: result.error.message }));
  }
}
