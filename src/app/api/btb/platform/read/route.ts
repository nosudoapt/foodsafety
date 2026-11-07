import { BtbApiError } from "@/lib/btb-api";
import { isUuid, isIsoDate } from "@/lib/btb-team";
import { isPlatformReadModule } from "@/lib/btb-platform";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * Location-scoped read model. The module decides the capability the SQL
 * boundary requires, so a designer can read marketing but not inventory and a
 * manager is confined to their own memberships.
 */
export const GET = platformRoute([], async ({ db, employeeId, sessionVersion }, request) => {
  const params = new URL(request.url).searchParams;
  const model = params.get("module");
  const location = params.get("location");
  const date = params.get("date");
  const month = params.get("month");
  if (!isPlatformReadModule(model)) throw new BtbApiError("Choose a workspace module.");
  if (model !== "settings" && !isUuid(location)) throw new BtbApiError("Choose a location.");
  if (date != null && !isIsoDate(date)) throw new BtbApiError("Choose a valid date.");
  if (month != null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BtbApiError("Choose a valid accounting month.");
  return platformRpc(db, "btb_platform_read", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_module: model,
    p_date: date ?? null,
    p_month: month ?? null,
  }, "This workspace could not be loaded.");
});
