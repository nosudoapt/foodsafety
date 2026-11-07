import { BtbApiError } from "@/lib/btb-api";
import { isIsoDate } from "@/lib/btb-team";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/** Read-only corporate overview: every active location, or only the actor's. */
export const GET = platformRoute([], async ({ db, employeeId, sessionVersion }, request) => {
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  const month = params.get("month");
  if (!isIsoDate(date)) throw new BtbApiError("Choose a valid date.");
  if (month != null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BtbApiError("Choose a valid accounting month.");
  return platformRpc(db, "btb_platform_overview", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_date: date,
    p_month: month,
  }, "The corporate overview could not be loaded.");
});
