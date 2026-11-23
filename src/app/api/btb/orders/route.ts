import { btbRequestLocation, btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { withLocation } from "@/lib/btb-location-context";
import { BTB_RESTAURANT, attributionName, btbToday, isIsoDate, isUuid, isVersion } from "@/lib/btb-team";
import { validOrderLines } from "@/lib/btb-operations";
import { BROOKS_ORDER_GUIDE } from "@/lib/brooks-order-guide";

const COLUMNS = "id,order_date,lines,version,saved_by_name,saved_at";
export const GET = btbRoute("order_sheet", false, async (context, request) => {
  const { db } = context;
  const location = await btbRequestLocation(context, request);
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  const before = params.get("before");
  const revisions = params.get("revisions");
  if (revisions) {
    if (!isUuid(revisions)) throw new BtbApiError("Choose a saved order.");
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new BtbApiError("Choose a valid history page.");
    // The sheet must belong to this branch before its history is exposed; a
    // guessed id from another branch is refused rather than silently empty.
    const sheet = await withLocation(db.from("btb_order_sheets").select("id")
      .eq("id", revisions).eq("restaurant_name", BTB_RESTAURANT), location).maybeSingle();
    dbError(sheet.error, "Order revisions could not be loaded.");
    if (!sheet.data) throw new BtbApiError("That order is not in this branch.", 404);
    const result = await db.from("btb_order_revisions").select("id,sheet_id,order_date,lines,version,saved_by_name,saved_at").eq("sheet_id", revisions).order("version", { ascending: false }).range(offset, offset + 29);
    dbError(result.error, "Order revisions could not be loaded.");
    return { revisions: result.data ?? [], hasMore: result.data?.length === 30 };
  }
  if (date && !isIsoDate(date) || before && !isIsoDate(before)) throw new BtbApiError("Choose a valid order date.");
  let query = withLocation(db.from("btb_order_sheets").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT), location);
  if (date) query = query.eq("order_date", date);
  if (before) query = query.lt("order_date", before);
  const result = await query.order("order_date", { ascending: false }).limit(date ? 1 : 30);
  dbError(result.error, "Orders could not be loaded. Please retry.");
  return { orders: result.data ?? [], hasMore: !date && result.data?.length === 30 };
}, { allowLocationWorkspace: true });

export const POST = btbRoute("order_sheet", true, async (context, request) => {
  const { db, identity } = context;
  const location = await btbRequestLocation(context, request);
  const body = await readBody(request);
  if (!isIsoDate(body.date) || body.date > btbToday() || !isVersion(body.version) || !validOrderLines(body.lines)) throw new BtbApiError("Check the order date and enter non-negative PAR and on-hand quantities.");
  const catalog = new Set(BROOKS_ORDER_GUIDE.flatMap((category) => category.items.map((item) => item.name)));
  if (body.lines.some((line) => !catalog.has(line.item_name))) {
    const existing = await withLocation(db.from("btb_order_sheets").select("lines")
      .eq("restaurant_name", BTB_RESTAURANT).eq("order_date", body.date), location).maybeSingle();
    dbError(existing.error, "The archived items in this order could not be verified.");
    const archived = new Set(validOrderLines(existing.data?.lines) ? existing.data.lines.map((line) => line.item_name) : []);
    if (body.lines.some((line) => !catalog.has(line.item_name) && !archived.has(line.item_name))) throw new BtbApiError("One of the items is no longer in this order guide. Reload the guide first.");
  }
  const lines = body.lines.map(({ item_name, par, on_hand }) => ({ item_name, par, on_hand }));
  const result = await db.rpc("btb_save_order_scoped", {
    p_date: body.date, p_lines: lines, p_version: body.version,
    p_employee_id: identity.employeeId, p_actor: attributionName(identity), p_location: location?.id ?? null,
  });
  if (result.error?.code === "40001") throw new BtbApiError("This order changed on another device. Reload the saved version before applying your draft.", 409);
  dbError(result.error, "The order could not be saved. Your draft is still here.");
  if (!result.data?.[0]) throw new BtbApiError("The save was not confirmed. Reload before trying again.", 503);
  return { order: result.data[0] };
}, { allowLocationWorkspace: true });
