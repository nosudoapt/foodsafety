import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { validateAccessChanges } from "@/lib/btb-page-access";

export const GET = btbRoute(undefined, false, async ({ access }) => ({ rows: access.rows }), { allowLocationWorkspace: true });

// Preserve the demo access editor. Console credentials never become this role.
export const POST = btbRoute("admin_dashboard", true, async ({ db }, request) => {
  const rows = validateAccessChanges(await readBody(request));
  if (!rows) throw new BtbApiError("Choose valid pages and permissions within each role’s access level.");
  const result = await db.from("role_page_access").upsert(rows, { onConflict: "role,page" }).abortSignal(AbortSignal.timeout(10_000));
  dbError(result.error, "Your access changes could not be saved. Please try again.");
  return { ok: true, rows };
});
