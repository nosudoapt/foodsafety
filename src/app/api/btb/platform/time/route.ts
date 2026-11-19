import { BtbApiError, readBody } from "@/lib/btb-api";
import { isIsoDate, isUuid } from "@/lib/btb-team";
import { TIME_ACTIONS, timeProblem, type TimeAction } from "@/lib/btb-time";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

export const GET = platformRoute([], async ({ db, employeeId, sessionVersion }, request) => {
  const params = new URL(request.url).searchParams;
  const location = params.get("location"), start = params.get("start");
  if (!isUuid(location) || !isIsoDate(start)) throw new BtbApiError("Choose a location and a valid schedule week.");
  return platformRpc(db, "btb_platform_time_read", {
    p_actor: employeeId, p_session: sessionVersion, p_location: location, p_start: start,
  }, "The schedule and worked hours could not be loaded. Check the location timezone and retry.");
});
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 16_000);
  const action = body.action as TimeAction;
  if (!isUuid(body.location_id) || !isUuid(body.request_id) || !TIME_ACTIONS.includes(action) || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new BtbApiError("Send a valid time-clock action.");
  const data = body.data as Record<string, unknown>;
  const problem = timeProblem(action, data);
  if (problem) throw new BtbApiError(problem);
  return { entry: await platformRpc(db, "btb_platform_time", {
    p_actor: employeeId, p_session: sessionVersion, p_location: body.location_id,
    p_request: body.request_id, p_action: action, p_data: data,
  }, action === "clock_out" ? "Clock-out was not confirmed. Check unpaid breaks; an open clock older than 24 hours needs an explained correction."
    : "The hours change was not confirmed. Reload the record and check the dates, breaks and approval state.") };
});
