import { BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { isIsoDate, isUuid } from "@/lib/btb-team";
import { TIME_ACTIONS, timeProblem, type TimeAction } from "@/lib/btb-time";
import { clientIp, deviceHash, policyFromRow, presenceProblem } from "@/lib/btb-clock-policy";
import { incompleteAssignments } from "@/lib/btb-task-completion";
import { taskLabel } from "@/lib/btb-tasks";
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
  if (action === "clock_in") {
    const settings = await db.from("btb_location_settings")
      .select("clock_geofence,clock_latitude,clock_longitude,clock_radius_m,clock_require_network,clock_networks,clock_require_device")
      .eq("location_id", body.location_id).maybeSingle();
    dbError(settings.error, "The branch’s clock-in policy could not be checked.");
    const policy = policyFromRow(settings.data as Record<string, unknown> | null);
    const numberOrNull = (value: unknown) => value == null || value === "" ? null : Number(value);
    const deviceId = typeof data.device === "string" ? data.device : "";
    const presence = {
      latitude: numberOrNull(data.latitude), longitude: numberOrNull(data.longitude),
      accuracy: numberOrNull(data.accuracy), ip: clientIp(request), deviceId,
    };
    let reason = presenceProblem(policy, presence);
    if (!reason && policy.requireDevice) {
      const hash = deviceHash(employeeId, deviceId);
      const bound = await db.from("btb_clock_devices").select("device_hash").eq("employee_id", employeeId).maybeSingle();
      dbError(bound.error, "The approved clock-in device could not be checked.");
      if (bound.data && bound.data.device_hash !== hash) {
        reason = "This is not the device approved for your time clock. Ask your manager to reset it.";
      } else if (!bound.data) {
        const saved = await db.from("btb_clock_devices").insert({
          employee_id: employeeId, location_id: body.location_id, device_hash: hash, bound_by: employeeId,
        });
        if (saved.error && saved.error.code !== "23505") throw new BtbApiError("The clock-in device could not be registered.", 503, saved.error);
      } else {
        await db.from("btb_clock_devices").update({ last_seen_at: new Date().toISOString() }).eq("employee_id", employeeId);
      }
    }
    // Every attempt is recorded, including refusals; a logging failure must not
    // silently allow a remote clock-in, but it also must not block a valid one.
    await db.from("btb_clock_attempts").insert({
      employee_id: employeeId, location_id: body.location_id, allowed: !reason, reason: reason ?? "",
      ip: presence.ip, latitude: presence.latitude, longitude: presence.longitude, accuracy_m: presence.accuracy,
    }).then(() => undefined, () => undefined);
    if (reason) throw new BtbApiError(reason, 403);
  }
  let incomplete: Awaited<ReturnType<typeof incompleteAssignments>> = [];
  if (action === "clock_out") {
    const current = await db.from("btb_time_entries").select("id,employee_id,location_id,work_date")
      .eq("id", data.id).eq("employee_id", employeeId).eq("location_id", body.location_id).maybeSingle();
    dbError(current.error, "The open clock could not be checked before clock-out.");
    if (current.data?.work_date) {
      incomplete = await incompleteAssignments(db, body.location_id, employeeId, current.data.work_date as string);
      if (incomplete.length) {
        const summary = incomplete.map((task) => `${taskLabel(task.task_type)}${task.note ? ` (${task.note})` : ""}`).join(", ");
        data.notes = [typeof data.notes === "string" ? data.notes.trim() : "", `Incomplete assigned tasks: ${summary}`]
          .filter(Boolean).join("\n").slice(0, 2000);
      }
    }
  }
  const entry = await platformRpc(db, "btb_platform_time", {
    p_actor: employeeId, p_session: sessionVersion, p_location: body.location_id,
    p_request: body.request_id, p_action: action, p_data: data,
  }, action === "clock_out" ? "Clock-out was not confirmed. Check unpaid breaks; an open clock older than 24 hours needs an explained correction."
    : "The hours change was not confirmed. Reload the record and check the dates, breaks and approval state.");
  if (action === "clock_out" && incomplete.length) {
    const marked = incomplete.map((task) => ({ task_type: task.task_type, note: task.note }));
    const saved = await db.from("btb_time_entries").update({ incomplete_tasks: marked }).eq("id", data.id as string);
    dbError(saved.error, "The incomplete-task note could not be stored. Ask a manager to review this clock-out.");
    return { entry: { ...(entry as object), incomplete_tasks: marked } };
  }
  return { entry };
});
