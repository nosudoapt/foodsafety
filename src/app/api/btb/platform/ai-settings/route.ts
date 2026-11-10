import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * AI extraction settings for one location. Corporate/owner only (the SQL
 * functions enforce the 'settings' capability). The stored API key never
 * leaves the database — responses carry presence plus a masked tail only.
 */
export const GET = platformRoute(["GET"], async ({ db, employeeId, sessionVersion }, request) => {
  const location = new URL(request.url).searchParams.get("location");
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  const settings = await platformRpc(db, "btb_ai_settings_get", {
    p_actor: employeeId, p_session: sessionVersion, p_location: location,
  }, "AI settings could not be loaded.");
  return { settings };
});

export const PUT = platformRoute(["PUT"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 8_000);
  const location = body.location_id;
  const form = body.form;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (form == null || typeof form !== "object" || Array.isArray(form)) throw new BtbApiError("Send the settings form.");
  const data = form as Record<string, unknown>;
  if (typeof data.api_key === "string" && data.api_key.trim() !== "" && data.api_key.trim().length < 20) {
    throw new BtbApiError("That API key looks too short to be valid.");
  }
  const limit = Number(data.daily_limit);
  if (data.daily_limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
    throw new BtbApiError("Set a daily limit between 1 and 500 extractions.");
  }
  const settings = await platformRpc(db, "btb_ai_settings_put", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_data: {
      enabled: data.enabled === true,
      model: typeof data.model === "string" ? data.model.trim().slice(0, 100) : "",
      api_key: typeof data.api_key === "string" ? data.api_key.trim() : "",
      remove_key: data.remove_key === true,
      daily_limit: Number.isInteger(limit) ? limit : 25,
      version: typeof data.version === "number" ? data.version : -1,
    },
  }, "AI settings could not be saved.");
  return { settings };
});
