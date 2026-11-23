import { btbAdminRoute } from "@/lib/btb-admin-api";
import { dbError } from "@/lib/btb-api";
import { maskEmail } from "@/lib/btb-login-guard";
import type { BtbAdminLoginActivity } from "@/lib/btb-admin";

// Sign-in history for the console: who tried, from which IP, and what the
// server decided. Kept 30 days by the migration.
export const GET = btbAdminRoute(async ({ db }) => {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [recent, success, failed, blocked] = await Promise.all([
    db.from("btb_login_events").select("created_at,email,ip,outcome,scope").order("created_at", { ascending: false }).limit(40),
    db.from("btb_login_events").select("id", { count: "exact", head: true }).eq("outcome", "success").gte("created_at", dayAgo),
    db.from("btb_login_events").select("id", { count: "exact", head: true }).in("outcome", ["bad_password", "no_account", "disabled"]).gte("created_at", dayAgo),
    db.from("btb_login_events").select("id", { count: "exact", head: true }).in("outcome", ["blocked", "ip_blocked"]).gte("created_at", dayAgo),
  ]);
  dbError(recent.error, "Sign-in activity could not be loaded.");
  dbError(success.error, "Sign-in activity could not be loaded.");
  dbError(failed.error, "Sign-in activity could not be loaded.");
  dbError(blocked.error, "Sign-in activity could not be loaded.");
  return {
    events: (recent.data ?? []).map((row) => ({
      created_at: row.created_at as string, email: maskEmail(String(row.email)), ip: (row.ip as string | null) ?? null,
      outcome: row.outcome as string, scope: row.scope as string,
    })),
    successes24h: success.count ?? 0, failures24h: failed.count ?? 0, blocked24h: blocked.count ?? 0,
  } satisfies BtbAdminLoginActivity;
});
