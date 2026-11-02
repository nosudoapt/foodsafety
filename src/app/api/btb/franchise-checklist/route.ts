import { randomUUID } from "node:crypto";
import { btbRoute, BtbApiError, dbError, readAll, readBody } from "@/lib/btb-api";
import { attributionName, isVersion } from "@/lib/btb-team";
import { FRANCHISE_SECTIONS, FRANCHISE_TASKS, type FranchiseTaskState } from "@/lib/btb-franchise";

const COLUMNS = "task_key,phase,task,custom,done,done_by_name,done_at,version";
export const GET = btbRoute("new_restaurant", false, async ({ db }) => ({
  tasks: await readAll<FranchiseTaskState>((from, to) => db.from("btb_franchise_tasks").select(COLUMNS).order("task_key").range(from, to), "Saved launch progress could not be loaded."),
}));

export const POST = btbRoute("new_restaurant", true, async ({ db, identity }, request) => {
  const body = await readBody(request);
  const add = body.action === "add";
  if (add && (typeof body.task !== "string" || !body.task.trim() || body.task.length > 500 || !FRANCHISE_SECTIONS.some((section) => section.title === body.phase))) throw new BtbApiError("Choose a section and enter a task under 500 characters.");
  if (!add && (typeof body.task_key !== "string" || !isVersion(body.version) || typeof body.done !== "boolean")) throw new BtbApiError("Choose a checklist task.");
  const template = FRANCHISE_TASKS.find((task) => task.key === body.task_key);
  const key = add ? `custom-${randomUUID()}` : String(body.task_key);
  const payload = { done: add ? false : body.done, done_by_name: !add && body.done ? attributionName(identity) : null, done_at: !add && body.done ? new Date().toISOString() : null, version: add ? 1 : Number(body.version) + 1 };
  let result;
  if (add || body.version === 0) {
    if (!add && !template) throw new BtbApiError("This launch task could not be found.", 404);
    result = await db.from("btb_franchise_tasks").insert({ task_key: key, phase: add ? body.phase : template!.phase, task: add ? String(body.task).trim() : template!.task, custom: add, ...payload }).select(COLUMNS).single();
  } else {
    result = await db.from("btb_franchise_tasks").update(payload).eq("task_key", key).eq("version", body.version).select(COLUMNS).maybeSingle();
  }
  dbError(result.error, "The launch task could not be saved.");
  if (!result.data) throw new BtbApiError("This task changed. Reload before trying again.", 409);
  return { task: result.data };
});

export const DELETE = btbRoute("new_restaurant", true, async ({ db }, request) => {
  const body = await readBody(request);
  if (typeof body.task_key !== "string" || !isVersion(body.version)) throw new BtbApiError("Choose an additional task.");
  const result = await db.from("btb_franchise_tasks").delete().eq("task_key", body.task_key).eq("custom", true).eq("version", body.version).select("task_key");
  dbError(result.error, "The additional task could not be removed.");
  if (result.data?.length !== 1) throw new BtbApiError("This task changed, or belongs to the required template. Reload before trying again.", 409);
  return { ok: true };
});
