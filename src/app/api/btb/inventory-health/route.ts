import { NextResponse } from "next/server";
import { legacyBtbRole as roleFromSession } from "@/lib/btb-api";
import { btbInventoryRoute, type BtbInventoryScope } from "@/lib/btb-inventory-route";

export const GET = btbInventoryRoute(readHealth);
import { MONTH_END_EDIT_ROLES } from "@/lib/btb-inventory-api";
import { hasServiceRoleKey, inventoryDb } from "@/lib/supabase-server";

const REQUIRED_TABLES = [
  "inventory_items",
  "inventory_counts",
  "inventory_month_summary",
  "inventory_purchases",
  "inventory_month_snapshots",
  "inventory_audit_log",
  "role_page_access",
] as const;

/**
 * Deployment smoke check for a manager/admin. A 200 response proves this code
 * version is deployed, the service-role key is configured server-side, and
 * every required table can be read through the privileged client. It returns
 * counts only — never credentials or row contents.
 */
async function readHealth(scope: BtbInventoryScope) {
  const locationId = scope.location.id;
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: "privileged database client is not configured" }, { status: 503 });
  }

  let db;
  try {
    db = inventoryDb();
  } catch {
    return NextResponse.json({ error: "privileged database client is not configured" }, { status: 503 });
  }

  const checks = await Promise.all(
    REQUIRED_TABLES.map(async (table) => {
      const query = db.from(table).select("*", { count: "exact", head: true });
      const { count, error } = await (table === "role_page_access" ? query : query.eq("location_id", locationId));
      return { table, count: count ?? 0, error: error?.message ?? null };
    }),
  );
  const failed = checks.filter((check) => check.error);
  if (failed.length > 0) {
    return NextResponse.json(
      { error: "inventory database check failed", failed: failed.map(({ table, error }) => ({ table, error })) },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    deployment: "inventory-server-v3",
    serviceRoleConfigured: true,
    tables: Object.fromEntries(checks.map(({ table, count }) => [table, count])),
  });
}
