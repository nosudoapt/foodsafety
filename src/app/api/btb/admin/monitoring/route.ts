import { btbAdminRoute, btbAdminRpc } from "@/lib/btb-admin-api";
import { BtbApiError } from "@/lib/btb-api";
import { btbAdminMonitoringDays, type BtbAdminMonitoring } from "@/lib/btb-admin";

/** Console overview: managed-location counts, storage, activity heatmap and
 * recent events. The SQL returns counts and timestamps only. */
export const GET = btbAdminRoute((context, request) => {
  const days = btbAdminMonitoringDays(new URL(request.url).searchParams.get("days"));
  if (days === null) throw new BtbApiError("Choose an activity window between 7 and 31 days.");
  return btbAdminRpc<BtbAdminMonitoring>(context, "btb_admin_monitoring", { p_days: days }, "Monitoring could not be loaded. Please retry.");
});
