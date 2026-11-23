import { btbRequestLocation, btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { BTB_RESTAURANT, btbToday, isIsoDate, isUuid } from "@/lib/btb-team";
import { cleaningTasks } from "@/lib/btb-cleaning";
import { locationColumn, withLocation, type BtbLocationContext } from "@/lib/btb-location-context";

/** One cleaning entry = one task on one week: who did it, when, and the photo
 *  paths for each side. The branch and the actor always come from the session,
 *  never from the browser. A shared tablet resolves to the legacy (unowned)
 *  tenant, exactly as it did when this page wrote straight to PostgREST. */
const COLUMNS = "id, task_name, week_start, done_by, done_date, done_time, before_photo, after_photo";

const text = (value: unknown, max = 200): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const photos = (value: unknown): string => {
  const list = Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length <= 400).slice(0, 6) : [];
  return JSON.stringify(list);
};
const mondayOf = (day: string): string => {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/** A real employee must resolve to a branch; only the aggregate/shared session
 *  falls back to the unowned tenant. */
function branchOrLegacy(
  context: { identity: { employeeId?: string | null } },
  location: BtbLocationContext | null,
): BtbLocationContext | null {
  if (!location && context.identity.employeeId) {
    throw new BtbApiError("No branch is assigned to your account. Ask your manager to assign one.", 403);
  }
  return location;
}

export const GET = btbRoute("cleaning_schedule", false, async (context, request) => {
  const { db } = context;
  const location = branchOrLegacy(context, await btbRequestLocation(context, request));
  const week = new URL(request.url).searchParams.get("week");
  let query = withLocation(
    db.from("cleaning_logs").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT), location);
  if (week) {
    if (!isIsoDate(week)) throw new BtbApiError("Choose a valid week.", 400);
    query = query.eq("week_start", mondayOf(week));
  }
  const result = await query.order("created_at", { ascending: false }).limit(600);
  dbError(result.error, "The cleaning history could not be loaded. Please retry.");
  return { logs: result.data ?? [], location: location ? { id: location.id, name: location.name } : null };
}, { allowLocationWorkspace: true });

export const POST = btbRoute("cleaning_schedule", true, async (context, request) => {
  const { db, identity } = context;
  const location = branchOrLegacy(context, await btbRequestLocation(context, request));
  const body = await readBody(request);

  if (body.action === "clear") {
    const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid).slice(0, 60) : (isUuid(body.id) ? [body.id] : []);
    if (!ids.length) throw new BtbApiError("Choose the entry to clear.", 400);
    const removed = await withLocation(db.from("cleaning_logs").delete(), location).in("id", ids);
    dbError(removed.error, "The entry could not be cleared. Please retry.");
    return { ok: true, cleared: ids.length };
  }

  const task = text(body.task_name, 160);
  if (!cleaningTasks.includes(task)) throw new BtbApiError("Choose a task from the cleaning schedule.", 400);
  const week = text(body.week_start, 10);
  if (!isIsoDate(week)) throw new BtbApiError("Choose a valid week.", 400);
  const rawDate = body.done_date;
  const doneDate = isIsoDate(rawDate) ? rawDate : btbToday();
  if (doneDate > btbToday()) throw new BtbApiError("A cleaning entry cannot be dated in the future.", 400);

  const payload = {
    task_name: task,
    week_start: mondayOf(week),
    done_date: doneDate,
    // Attribution is automatic from the signed-in identity.
    done_by: identity.name,
    done_time: text(body.done_time, 5) || null,
    before_photo: photos(body.before_photo),
    after_photo: photos(body.after_photo),
  };

  // One row per task per week per branch: reuse the existing row when there is
  // one so a re-save never stacks duplicates.
  const found = await withLocation(
    db.from("cleaning_logs").select("id").eq("restaurant_name", BTB_RESTAURANT)
      .eq("week_start", payload.week_start).eq("task_name", task), location,
  ).limit(1).maybeSingle();
  dbError(found.error, "The entry could not be checked. Please retry.");

  if (found.data?.id) {
    const updated = await withLocation(
      db.from("cleaning_logs").update(payload).eq("id", found.data.id), location,
    ).select(COLUMNS).maybeSingle();
    dbError(updated.error, "The entry could not be saved. Please retry.");
    if (updated.data) return { ok: true, log: updated.data };
  }

  const created = await db.from("cleaning_logs").insert({
    restaurant_name: BTB_RESTAURANT, location_id: locationColumn(location), ...payload,
  }).select(COLUMNS).single();
  dbError(created.error, "The entry could not be saved. Please retry.");
  return { ok: true, log: created.data };
}, { allowLocationWorkspace: true });
