import { btbRequestLocation, btbRoute, BtbApiError, dbError } from "@/lib/btb-api";
import { canViewEditLog, EDIT_LOG_DAYS } from "@/lib/btb-edit-log";

/** Field-level audit of the prep and order sheets. Owner, supervisor and
 *  corporate only — a manager or staff member is refused here, not just hidden
 *  in the UI. */
export const GET = btbRoute(undefined, false, async (context, request) => {
  const { db, identity } = context;
  if (!canViewEditLog(identity.role)) throw new BtbApiError("Only an owner or supervisor can read the edit log.", 403);
  const location = await btbRequestLocation(context, request);
  if (!location) throw new BtbApiError("Open a branch workspace to read its edit log.", 400);
  const params = new URL(request.url).searchParams;
  const area = params.get("area");
  const since = new Date(Date.now() - EDIT_LOG_DAYS * 86_400_000).toISOString();
  let query = db.from("btb_edit_log")
    .select("id,area,sheet_date,actor_name,actor_role,section,item_name,field,old_value,new_value,created_at")
    .eq("location_id", location.id).gte("created_at", since);
  if (area === "prep" || area === "order") query = query.eq("area", area);
  const result = await query.order("created_at", { ascending: false }).limit(200);
  dbError(result.error, "The edit log could not be loaded. Please retry.");
  return { entries: result.data ?? [], days: EDIT_LOG_DAYS };
}, { allowLocationWorkspace: true });
