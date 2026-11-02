import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { attributionName, BTB_RESTAURANT, btbToday, isIsoDate, isVersion } from "@/lib/btb-team";
import { canonicalCheckItems, type BtbShiftCheck, type CheckType } from "@/lib/btb-operations";

const COLUMNS = "id,check_date,check_type,items,done_count,total_count,completed,notes,saved_by_name,updated_at,version";
export const GET = btbRoute("checklists", false, async ({ db }, request) => {
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  const before = params.get("before");
  if (date && !isIsoDate(date) || before && !isIsoDate(before)) throw new BtbApiError("Choose a valid date.");
  let query = db.from("btb_shift_checks").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT);
  if (date) query = query.eq("check_date", date);
  if (before) query = query.lt("check_date", before);
  const result = await query.order("check_date", { ascending: false }).order("check_type").limit(date ? 2 : 61);
  dbError(result.error, "Saved checklists could not be loaded. Please retry.");
  const rows = result.data ?? [];
  // Never split a day's opening and closing records across date-based pages.
  const checks = rows.length === 61 && rows[59].check_date !== rows[60].check_date ? rows.slice(0, 60) : rows;
  return { checks, hasMore: !date && rows.length === 61 };
});

export const POST = btbRoute("checklists", true, async ({ db, identity }, request) => {
  if (!identity.employeeId) throw new BtbApiError("Sign in with your individual employee account to record who completed these duties.", 403);
  const body = await readBody(request);
  if (!isIsoDate(body.date) || body.date > btbToday() || !["opening", "closing"].includes(String(body.type)) || !isVersion(body.version)) throw new BtbApiError("Choose today or an earlier checklist date.");
  if (typeof body.notes !== "string" || body.notes.length > 2000 || !Array.isArray(body.changes) || body.changes.length > 40) throw new BtbApiError("Keep notes under 2,000 characters and review your checklist changes.");
  const type = body.type as CheckType;
  const saved = await db.from("btb_shift_checks").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT).eq("check_date", body.date).eq("check_type", type).maybeSingle();
  dbError(saved.error, "The current checklist could not be verified.");
  const current = saved.data as BtbShiftCheck | null;
  if ((current?.version ?? 0) !== body.version) throw new BtbApiError("This checklist changed on another device. Reload the saved version before applying your draft.", 409);
  const items = canonicalCheckItems(type, current?.items);
  const changed = new Set<string>();
  for (const change of body.changes) {
    if (!change || typeof change.id !== "string" || typeof change.completed !== "boolean" || changed.has(change.id)) throw new BtbApiError("The checklist changes are invalid.");
    const item = items.find((item) => item.id === change.id);
    if (!item) throw new BtbApiError("One of these duties is no longer on this checklist.");
    changed.add(item.id);
    if (item.completed === change.completed) continue;
    item.completed = change.completed;
    item.completed_by = change.completed ? identity.employeeId : null;
    item.completed_by_name = change.completed ? identity.name : null;
    item.completed_at = change.completed ? new Date().toISOString() : null;
  }
  const result = await db.rpc("btb_save_shift_check", { p_date: body.date, p_type: type, p_version: body.version, p_items: items, p_notes: body.notes.trim(), p_employee_id: identity.employeeId, p_actor: attributionName(identity) });
  dbError(result.error, "This checklist could not be saved. Your draft is still on this device.");
  if (!result.data?.[0]) throw new BtbApiError("The save was not confirmed. Please reload before retrying.", 503);
  return { check: result.data[0] };
});
