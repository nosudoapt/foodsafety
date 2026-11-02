import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { verifiedBtbRole as roleFromSession } from "@/lib/btb-api";
import { MONTH_END_EDIT_ROLES, requireRole } from "@/lib/btb-inventory-api";
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
export async function GET() {
  const cookieStore = await cookies();
  const auth = requireRole(await roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
      const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
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
