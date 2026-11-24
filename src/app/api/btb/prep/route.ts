import { btbRequestLocation, btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import {
  canSeePrepPar, isPrepCategory, parSetIsCurrent, parWeekStart, PREP_HISTORY_DAYS, prepCategoryItems, prepCategoryMode,
  prepSubmitState, prepSubmissionNotice, visiblePrepCategories,
} from "@/lib/btb-prep";
import { btbToday, isIsoDate, isUuid } from "@/lib/btb-team";
import { canViewEditLog, diffSheet, recordEdits } from "@/lib/btb-edit-log";

const MANAGE_ROLES = ["manager", "supervisor", "owner", "corporate"];
const MAX_ITEMS = 400;

type DraftCell = { oh?: string; make?: string; pull?: string; done?: boolean };
const str = (value: unknown, max = 160): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999_999 ? Math.round(parsed * 100) / 100 : NaN;
};

interface PrepLevel { item_key: string; item_name: string; category: string; unit: string; par: number; urgent: boolean; custom: boolean }

/**
 * The rows printed for one section.
 *
 * PAR levels are per location and per week, so a location whose week has not
 * been set yet has no rows at all — the sheet then rendered nearly empty, which
 * looks like lost data. Fall back to the printed catalog for any section with
 * no saved levels, so the team can always record the shift. Saved levels, once
 * present, win; a manager's custom row is never replaced by the catalog.
 */
function prepRowsFor(category: string, levels: PrepLevel[]): PrepLevel[] {
  const saved = levels.filter((level) => level.category === category);
  if (saved.length) return saved;
  return prepCategoryItems(category).map((item) => ({
    item_key: item.key, item_name: item.name, category, unit: item.unit, par: 0, urgent: false, custom: false,
  }));
}

/** Reads the whole sheet for one day: PAR levels for the week, assignments,
 *  saved rows, the caller's own drafts, comments and manager notices. */
export const GET = btbRoute("prep_list", false, async (context, request) => {
  const { db, identity } = context;
  const location = await btbRequestLocation(context, request);
  if (!location) throw new BtbApiError("Open your branch workspace to use the prep sheet.", 400);
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? btbToday();
  if (!isIsoDate(date)) throw new BtbApiError("Choose a valid date.");
  const weekStart = parWeekStart(date);
  const canManage = MANAGE_ROLES.includes(identity.role);
  const since = new Date(`${date}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - PREP_HISTORY_DAYS);

  const [levels, assignments, rows, drafts, team, comments, notices, submissions] = await Promise.all([
    db.from("btb_prep_par_levels").select("item_key,item_name,category,unit,par,urgent,custom").eq("location_id", location.id).eq("week_start", weekStart),
    db.from("btb_prep_assignments").select("category,employee_id").eq("location_id", location.id).eq("week_start", weekStart),
    db.from("prep_counts").select("item_name,category,unit,par,on_hand,pull,urgent,done,custom").eq("location_id", location.id).eq("count_date", date),
    db.from("btb_prep_drafts").select("employee_id,category,data").eq("location_id", location.id).eq("count_date", date),
    db.from("btb_location_access").select("employee_id").eq("location_id", location.id),
    db.from("btb_prep_comments").select("id,author_name,author_role,body,created_at").eq("location_id", location.id).eq("count_date", date).order("created_at").limit(100),
    db.from("btb_prep_events").select("id,kind,body,created_at").eq("location_id", location.id).is("read_at", null).order("created_at", { ascending: false }).limit(20),
    db.from("btb_prep_submissions").select("employee_name,categories,complete,missing,submitted_at").eq("location_id", location.id)
      .gte("count_date", since.toISOString().slice(0, 10)).lte("count_date", date).order("submitted_at", { ascending: false }).limit(200),
  ]);
  dbError(levels.error ?? assignments.error ?? rows.error ?? drafts.error ?? team.error ?? comments.error ?? notices.error ?? submissions.error,
    "The prep sheet could not be loaded. Please retry.");
  const memberIds = ((team.data ?? []) as { employee_id: string }[]).map((row) => row.employee_id);
  const staff = memberIds.length
    ? await db.from("btb_employees").select("id,name,role").in("id", memberIds).eq("active", true).order("name")
    : { data: [] as { id: string; name: string; role: string }[], error: null };
  dbError(staff.error, "The branch team could not be loaded. Please retry.");

  const assigned = (assignments.data ?? []) as { category: string; employee_id: string }[];
  const mine = assigned.filter((row) => row.employee_id === identity.employeeId).map((row) => row.category);
  const categories = visiblePrepCategories(identity.role, mine);
  const canSeePar = canSeePrepPar(identity.role);

  const saved = new Map(((rows.data ?? []) as Record<string, unknown>[]).map((row) => [row.item_name as string, row]));
  const draftsForMe = new Map<string, Record<string, DraftCell>>();
  for (const draft of (drafts.data ?? []) as { employee_id: string; category: string; data: Record<string, DraftCell> }[]) {
    if (canManage || draft.employee_id === identity.employeeId) draftsForMe.set(draft.category, draft.data ?? {});
  }

  const sheet = categories.map((category) => ({
    category,
    mode: prepCategoryMode(category),
    assigned: assigned.filter((row) => row.category === category).map((row) => row.employee_id),
    mine: mine.includes(category),
    items: prepRowsFor(category, (levels.data ?? []) as { item_key: string; item_name: string; category: string; unit: string; par: number; urgent: boolean; custom: boolean }[])
      .map((level) => {
        const row = saved.get(level.item_key);
        const draft = (draftsForMe.get(category) ?? {})[level.item_key] ?? {};
        return {
          key: level.item_key, name: level.item_name, unit: level.unit, urgent: level.urgent, custom: level.custom,
          par: canSeePar ? Number(level.par) : null,
          oh: str(draft.oh ?? row?.on_hand ?? "", 12),
          make: prepCategoryMode(category) === "pull" ? null : str(draft.make ?? "", 12),
          pull: prepCategoryMode(category) === "pull" ? str(draft.pull ?? row?.pull ?? "", 12) : null,
          done: draft.done === true || (draft.done === undefined && row?.done === true),
        };
      }),
  }));

  const mark = await db.from("btb_par_weeks").select("set_at")
    .eq("location_id", location.id).eq("area", "prep").eq("week_start", weekStart).maybeSingle();
  dbError(mark.error, "The week's PAR status could not be checked. Please retry.");
  const setAt = (mark.data?.set_at as string | undefined) ?? null;

  return {
    date, weekStart, historyDays: PREP_HISTORY_DAYS, canManage, canSeePar,
    parSet: canManage ? parSetIsCurrent(setAt) : null,
    parSetAt: setAt,
    categories: sheet,
    team: (staff.data ?? []).map((row) => ({ id: row.id, name: row.name, role: row.role })),
    comments: comments.data ?? [], notices: notices.data ?? [], submissions: submissions.data ?? [],
    employeeId: identity.employeeId,
    canViewEditLog: canViewEditLog(identity.role),
  };
}, { allowLocationWorkspace: true, page: "prep-list" });


/** Writes: autosave a draft, submit the day, set the week's PAR levels and
 *  assignments, comment, or clear the manager notices. */
export const POST = btbRoute("prep_list", true, async (context, request) => {
  const { db, identity } = context;
  const location = await btbRequestLocation(context, request);
  if (!location) throw new BtbApiError("Open your branch workspace to use the prep sheet.", 400);
  if (!identity.employeeId) throw new BtbApiError("Sign in with your individual employee account to use the prep sheet.", 403);
  const body = await readBody(request, 64_000);
  const action = str(body.action, 20);
  const date = body.date;
  const needsDate = ["draft", "submit", "comment"].includes(action);
  if (needsDate && !isIsoDate(date)) throw new BtbApiError("Choose a valid date.");
  const day = date as string;

  if (action === "draft" || action === "submit") {
    const mine = ((await db.from("btb_prep_assignments").select("category")
      .eq("location_id", location.id).eq("week_start", parWeekStart(day)).eq("employee_id", identity.employeeId)).data ?? [])
      .map((row) => row.category as string);
    const allowed = visiblePrepCategories(identity.role, mine);
    if (!allowed.length) throw new BtbApiError("No prep section is assigned to you this week.", 403);

    if (action === "draft") {
      const data = body.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new BtbApiError("The draft is invalid.");
      const rows: Record<string, unknown>[] = [];
      let count = 0;
      for (const [category, cells] of Object.entries(data as Record<string, unknown>)) {
        if (!allowed.includes(category) || !cells || typeof cells !== "object" || Array.isArray(cells)) continue;
        const clean: Record<string, DraftCell> = {};
        for (const [key, cell] of Object.entries(cells as Record<string, unknown>)) {
          if (!key || key.length > 160 || ++count > MAX_ITEMS) continue;
          const row = (cell ?? {}) as Record<string, unknown>;
          clean[key] = { oh: str(row.oh, 12), make: str(row.make, 12), pull: str(row.pull, 12), done: row.done === true };
        }
        rows.push({ location_id: location.id, count_date: day, employee_id: identity.employeeId, category, data: clean, updated_at: new Date().toISOString() });
      }
      if (!rows.length) throw new BtbApiError("Nothing to save.");
      const saved = await db.from("btb_prep_drafts").upsert(rows, { onConflict: "location_id,count_date,employee_id,category" });
      dbError(saved.error, "The draft could not be saved. Keep typing and retry.");
      return { ok: true, savedAt: new Date().toISOString() };
    }

    // Submit: merge the week's PAR levels with this person's own numbers.
    const [levels, drafts, savedRows] = await Promise.all([
      db.from("btb_prep_par_levels").select("item_key,item_name,category,unit,par,urgent,custom")
        .eq("location_id", location.id).eq("week_start", parWeekStart(day)).in("category", allowed),
      db.from("btb_prep_drafts").select("category,data").eq("location_id", location.id)
        .eq("count_date", day).eq("employee_id", identity.employeeId),
      db.from("prep_counts").select("item_name,on_hand,pull,done").eq("location_id", location.id).eq("count_date", day),
    ]);
    dbError(levels.error ?? drafts.error ?? savedRows.error, "The submission could not be prepared. Please retry.");
    if (!(levels.data ?? []).length) throw new BtbApiError("Your manager has not set this week's PAR levels yet.", 409);
    const draftMap = new Map(((drafts.data ?? []) as { category: string; data: Record<string, DraftCell> }[])
      .map((row) => [row.category, row.data ?? {}]));
    const savedMap = new Map(((savedRows.data ?? []) as Record<string, unknown>[])
      .map((row) => [row.item_name as string, row]));
    const asNumber = (value: unknown) => (/^\d+(\.\d{1,2})?$/.test(String(value ?? "")) ? Number(value) : 0);

    const rows = ((levels.data ?? []) as { item_key: string; item_name: string; category: string; unit: string; par: number; urgent: boolean; custom: boolean }[])
      .map((level) => {
        const cell = (draftMap.get(level.category) ?? {})[level.item_key] ?? {};
        const previous = savedMap.get(level.item_key);
        return {
          restaurant_name: "Between the Buns", location_id: location.id, count_date: day,
          item_name: level.item_key, category: level.category, unit: level.unit,
          par: Number(level.par), urgent: level.urgent, custom: level.custom,
          on_hand: asNumber(cell.oh ?? previous?.on_hand),
          pull: prepCategoryMode(level.category) === "pull" ? asNumber(cell.pull ?? previous?.pull) : 0,
          done: cell.done === true || (cell.done === undefined && previous?.done === true),
        };
      });
    const state = prepSubmitState(rows.map((row) => ({ key: row.item_name, done: row.done })));
    const cellOf = (row: Record<string, unknown>) => ({ "OH": String(row.on_hand ?? ""), "Pull": String(row.pull ?? ""), "Done": row.done === true ? "true" : "false" });
    await recordEdits(db, diffSheet(
      Object.fromEntries(((savedRows.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.item_name), cellOf(row)])),
      Object.fromEntries(rows.map((row) => [row.item_name, cellOf(row)])),
      { tenant_id: "Between the Buns", location_id: location.id, area: "prep", sheet_date: day,
        actor_id: identity.employeeId, actor_name: identity.name, actor_role: identity.role },
      (item) => rows.find((row) => row.item_name === item)?.category ?? "",
    ));
    const replaced = await db.from("prep_counts").delete().eq("location_id", location.id).eq("count_date", day).in("category", allowed);
    dbError(replaced.error, "The day's sheet could not be replaced. Nothing was changed.");
    const inserted = await db.from("prep_counts").insert(rows);
    dbError(inserted.error, "The sheet could not be saved. Your draft is still on this device.");

    const categories = [...new Set(rows.map((row) => row.category))];
    const notice = prepSubmissionNotice(identity.name, categories, state.missing);
    const [submission, event] = await Promise.all([
      db.from("btb_prep_submissions").insert({
        location_id: location.id, count_date: day, employee_id: identity.employeeId,
        employee_name: identity.name, categories, complete: state.complete, missing: state.missing,
      }),
      db.from("btb_prep_events").insert({ location_id: location.id, kind: "prep_submission", body: notice }),
    ]);
    dbError(submission.error ?? event.error, "The sheet saved, but the manager notice could not be queued.");
    await db.from("btb_prep_drafts").delete().eq("location_id", location.id).eq("count_date", day).eq("employee_id", identity.employeeId);
    return { ok: true, complete: state.complete, missing: state.missing, notice };
  }


  if (action === "par" || action === "assign") {
    if (!MANAGE_ROLES.includes(identity.role)) throw new BtbApiError("Only a manager can set PAR levels or assign sections.", 403);
    if (!isIsoDate(body.weekStart)) throw new BtbApiError("Choose the week to set up.");
    const week = parWeekStart(body.weekStart as string);
    if (body.weekStart !== week) throw new BtbApiError(`PAR levels are set per week starting Friday (${week}).`);

    const members = new Set(((await db.from("btb_location_access").select("employee_id")
      .eq("location_id", location.id)).data ?? []).map((row) => row.employee_id as string));

    if (action === "par") {
      const levels = body.levels;
      if (!Array.isArray(levels) || levels.length > MAX_ITEMS) throw new BtbApiError("Send the PAR levels for this week.");
      const seen = new Set<string>();
      const clean = levels.map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        const category = str(row.category, 60);
        const key = str(row.key, 160), name = str(row.name, 160);
        const par = num(row.par);
        if (!isPrepCategory(category)) throw new BtbApiError("Choose a valid prep section.");
        if (!key || !name) throw new BtbApiError("Every PAR level needs an item.");
        if (Number.isNaN(par)) throw new BtbApiError("Enter PAR as a number of 0 or more.");
        if (seen.has(key)) throw new BtbApiError(`“${name}” is listed twice.`);
        seen.add(key);
        return {
          location_id: location.id, week_start: week, item_key: key, item_name: name, category,
          unit: str(row.unit, 24), par, urgent: row.urgent === true, custom: row.custom === true,
          set_by: identity.employeeId, set_by_name: identity.name, set_at: new Date().toISOString(),
        };
      });
      const previousLevels = await db.from("btb_prep_par_levels").select("item_key,unit,par,urgent,category")
        .eq("location_id", location.id).eq("week_start", week);
      dbError(previousLevels.error, "The previous PAR levels could not be read.");
      const parCell = (row: Record<string, unknown>) => ({ "PAR": String(row.par ?? ""), "Unit": String(row.unit ?? ""), "Urgent": row.urgent === true ? "urgent" : "" });
      await recordEdits(db, diffSheet(
        Object.fromEntries(((previousLevels.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.item_key), parCell(row)])),
        Object.fromEntries(clean.map((row) => [row.item_key, parCell(row)])),
        { tenant_id: "Between the Buns", location_id: location.id, area: "prep", sheet_date: btbToday(),
          actor_id: identity.employeeId, actor_name: identity.name, actor_role: identity.role },
        (item) => clean.find((row) => row.item_key === item)?.category ?? "",
      ));
      const cleared = await db.from("btb_prep_par_levels").delete().eq("location_id", location.id).eq("week_start", week);
      dbError(cleared.error, "The previous PAR levels could not be replaced.");
      if (clean.length) {
        const inserted = await db.from("btb_prep_par_levels").insert(clean);
        dbError(inserted.error, "The PAR levels could not be saved. Please retry.");
      }
      const marker = await db.from("btb_par_weeks").upsert({
        location_id: location.id, area: "prep", week_start: week,
        set_by: identity.employeeId, set_by_name: identity.name, set_at: new Date().toISOString(),
      }, { onConflict: "location_id,area,week_start" });
      dbError(marker.error, "The week could not be marked as set up.");
      if (!clean.length) {
        await db.from("btb_par_weeks").delete().eq("location_id", location.id).eq("area", "prep").eq("week_start", week);
      }
      return { ok: true, weekStart: week, items: clean.length };
    }

    const assignments = body.assignments;
    if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) throw new BtbApiError("Send the section assignments.");
    const rows: Record<string, unknown>[] = [];
    for (const [category, ids] of Object.entries(assignments as Record<string, unknown>)) {
      if (!isPrepCategory(category) || !Array.isArray(ids)) continue;
      for (const id of ids.slice(0, 30)) {
        if (!isUuid(id)) throw new BtbApiError("Choose staff from this branch.");
        if (!members.has(id)) throw new BtbApiError("One of those people does not work at this branch.");
        rows.push({ location_id: location.id, week_start: week, category, employee_id: id, assigned_by: identity.employeeId });
      }
    }
    const cleared = await db.from("btb_prep_assignments").delete().eq("location_id", location.id).eq("week_start", week);
    dbError(cleared.error, "The previous assignments could not be replaced.");
    if (rows.length) {
      const inserted = await db.from("btb_prep_assignments").insert(rows);
      dbError(inserted.error, "The assignments could not be saved. Please retry.");
    }
    return { ok: true, weekStart: week, assignments: rows.length };
  }

  if (action === "add-item") {
    if (!MANAGE_ROLES.includes(identity.role)) throw new BtbApiError("Only a manager can add an item.", 403);
    if (!isIsoDate(body.weekStart) || body.weekStart !== parWeekStart(body.weekStart as string)) {
      throw new BtbApiError(`PAR levels are set per week starting Friday (${parWeekStart(String(body.weekStart))}).`);
    }
    const week = body.weekStart as string;
    const category = str(body.category, 60);
    const name = str(body.name, 160);
    const par = num(body.par);
    if (!isPrepCategory(category)) throw new BtbApiError("Choose a valid prep section.");
    if (!name) throw new BtbApiError("Name the item you are adding.");
    if (Number.isNaN(par)) throw new BtbApiError("Enter PAR as a number of 0 or more.");
    const saved = await db.from("btb_prep_par_levels").upsert({
      location_id: location.id, week_start: week, item_key: name, item_name: name, category,
      unit: str(body.unit, 24), par, urgent: body.urgent === true, custom: true,
      set_by: identity.employeeId, set_by_name: identity.name, set_at: new Date().toISOString(),
    }, { onConflict: "location_id,week_start,item_key" });
    dbError(saved.error, "The item could not be added. Please retry.");
    const marker = await db.from("btb_par_weeks").upsert({
      location_id: location.id, area: "prep", week_start: week,
      set_by: identity.employeeId, set_by_name: identity.name, set_at: new Date().toISOString(),
    }, { onConflict: "location_id,area,week_start" });
    dbError(marker.error, "The week could not be marked as set up.");
    return { ok: true, item: name, weekStart: week };
  }

  if (action === "comment") {
    const text = str(body.body, 1000);
    if (!text) throw new BtbApiError("Write a comment first.");
    const saved = await db.from("btb_prep_comments").insert({
      location_id: location.id, count_date: day, author_employee_id: identity.employeeId,
      author_name: identity.name, author_role: identity.role, body: text,
    });
    dbError(saved.error, "The comment could not be saved.");
    return { ok: true };
  }

  if (action === "notices-read") {
    const cleared = await db.from("btb_prep_events").update({ read_at: new Date().toISOString() })
      .eq("location_id", location.id).is("read_at", null);
    dbError(cleared.error, "The notices could not be cleared.");
    return { ok: true };
  }

  throw new BtbApiError("Choose an action: draft, submit, par, assign, comment or notices-read.");
}, { allowLocationWorkspace: true, page: "prep-list" });

