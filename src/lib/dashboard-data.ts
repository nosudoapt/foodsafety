import type { SupabaseClient } from "@supabase/supabase-js";
import type { NavIcon } from "./admin-nav";
import { dashboardDates, dashboardRecordScope, metricQuery, metricsForRole, type DashboardContext, type MetricId, type MetricValues } from "./dashboard";
import { queryExactCount } from "./query-count";

export interface DashboardActivity { id: string; title: string; detail: string; at: string; href: string; icon: NavIcon }
export interface DashboardResult { values: MetricValues; activity: DashboardActivity[]; activityUnavailable: boolean; updatedAt: string }

// Kept injectable for tests; the caller supplies the authenticated browser
// client, so existing Supabase row-level policies continue to apply.
export async function loadDashboard(client: SupabaseClient, context: DashboardContext, now: Date, signal: AbortSignal): Promise<DashboardResult> {
  const ids = metricsForRole(context.role);
  const [entries, feed] = await Promise.all([
    Promise.all(ids.filter((id) => id !== "locations").map(async (id): Promise<[MetricId, number | null]> => {
      const spec = metricQuery(id, context, now);
      return [id, spec ? await queryExactCount(client, spec.table, spec.filters, signal) : null];
    })),
    loadActivity(client, context, now, signal),
  ]);
  return { values: Object.fromEntries(entries), ...feed, updatedAt: new Date().toISOString() };
}

async function loadActivity(client: SupabaseClient, context: DashboardContext, now: Date, signal: AbortSignal) {
  const dates = dashboardDates(now);
  const designer = context.role === "designer";
  const sources = designer
    ? [{ table: "marketing_promotions", columns: "id, title, status, created_at", timestamp: "created_at", href: "/admin/marketing", icon: "marketing" as NavIcon }]
    : [
        { table: "daily_checks", columns: "id, check_type, completed, created_at", timestamp: "created_at", href: "/checks", icon: "checks" as NavIcon },
        { table: "temperature_records", columns: "id, food_item, equipment_name, temperature, unit, is_safe, recorded_at", timestamp: "recorded_at", href: "/temperatures", icon: "temperature" as NavIcon },
        { table: "corrective_actions", columns: "id, issue_description, resolved, created_at", timestamp: "created_at", href: "/corrective-actions", icon: "protocols" as NavIcon },
      ];
  const results = await Promise.all(sources.map(async (source) => {
    try {
      let query = client.from(source.table).select(source.columns).gte(source.timestamp, dates.week).lt(source.timestamp, dates.end);
      const scope = dashboardRecordScope(designer ? "restaurant" : source.table === "daily_checks" ? "personal" : "site", context);
      if (!scope) return { rows: [] as DashboardActivity[], failed: true };
      query = scope.op === "in" ? query.in(scope.column, scope.value) : query.eq(scope.column, scope.value);
      const { data, error } = await query.order(source.timestamp, { ascending: false }).limit(5).abortSignal(signal);
      if (error) return { rows: [] as DashboardActivity[], failed: true };
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        failed: false,
        rows: rows.map((row): DashboardActivity => {
          let title = String(row.title || row.food_item || row.equipment_name || row.issue_description || "Saved record");
          let detail = String(row.status || "Recorded");
          if (source.table === "daily_checks") {
            title = `${row.check_type === "closing" ? "Closing" : "Opening"} checklist`;
            detail = row.completed ? "Completed · your record" : "In progress · your record";
          } else if (source.table === "temperature_records") detail = `${row.temperature}°${row.unit || "C"} · ${row.is_safe ? "Within safe range" : "Outside safe range"}`;
          else if (source.table === "corrective_actions") detail = row.resolved ? "Action resolved" : "Action open";
          return { id: `${source.table}:${row.id}`, title, detail, at: String(row[source.timestamp]), href: source.href, icon: source.icon };
        }),
      };
    } catch { return { rows: [] as DashboardActivity[], failed: true }; }
  }));
  return {
    activity: results.flatMap((result) => result.rows).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
    activityUnavailable: results.some((result) => result.failed),
  };
}

export interface LocationPulse { id: string; name: string; address?: string | null; values: MetricValues }

export async function loadLocationPulse(client: SupabaseClient, context: DashboardContext, sites: { id: string; name: string; address?: string | null }[], now: Date, signal: AbortSignal): Promise<LocationPulse[]> {
  // Three exact counts per permitted site; no table scan or capped row total.
  return Promise.all(sites.map(async (site) => {
    const scoped = { ...context, locationIds: [site.id] };
    const entries = await Promise.all((["temperatureAlerts", "renewals", "openActions"] as const).map(async (id) => {
      const spec = metricQuery(id, scoped, now);
      return [id, spec ? await queryExactCount(client, spec.table, spec.filters, signal) : null] as const;
    }));
    return { ...site, values: Object.fromEntries(entries) };
  }));
}
