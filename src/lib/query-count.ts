import type { SupabaseClient } from "@supabase/supabase-js";

export type CountFilter =
  | { column: string; op: "eq" | "gte" | "lt" | "lte"; value: string | boolean }
  | { column: string; op: "in"; value: string[] }
  | { column: string; op: "notNull"; value?: never };

function selectCount(client: SupabaseClient, table: string) {
  return client.from(table).select("id", { count: "exact", head: true });
}

type CountBuilder = ReturnType<typeof selectCount>;

function applyFilter(query: CountBuilder, filter: CountFilter): CountBuilder {
  switch (filter.op) {
    case "in": return query.in(filter.column, filter.value);
    case "notNull": return query.not(filter.column, "is", null);
    case "eq": return query.eq(filter.column, filter.value);
    case "gte": return query.gte(filter.column, filter.value);
    case "lt": return query.lt(filter.column, filter.value);
    case "lte": return query.lte(filter.column, filter.value);
  }
}

/** Null is unavailable; zero is a successfully counted empty result. */
export function verifiedCount(result: { count: number | null; error?: unknown }): number | null {
  return !result.error && typeof result.count === "number" && Number.isInteger(result.count) && result.count >= 0 ? result.count : null;
}

export async function queryExactCount(client: SupabaseClient, table: string, filters: CountFilter[], signal: AbortSignal): Promise<number | null> {
  try {
    let query = selectCount(client, table);
    for (const filter of filters) query = applyFilter(query, filter);
    return verifiedCount(await query.abortSignal(signal));
  } catch {
    return null;
  }
}
