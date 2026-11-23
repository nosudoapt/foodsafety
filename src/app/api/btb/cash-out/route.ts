import { btbRequestLocation, btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { btbToday, isIsoDate } from "@/lib/btb-team";
import { cleanStaffMeals, cleanWastage, retentionCutoff } from "@/lib/cash-out";
import { locationColumn, withLocation, type BtbLocationContext } from "@/lib/btb-location-context";

/** End-of-day till count. Everyone reads their branch's count; only a manager
 *  writes one (the feature matrix decides — see btb-access). The branch and the
 *  person come from the session, never from the request body. A shared tablet
 *  keeps the legacy unowned tenant it has always used. */
const COLUMNS = [
  "id", "count_date", "till_amount", "cash_sale", "delivery_fees", "driver_tips", "cash_out", "safe_drop",
  "local_purchase", "single_trays", "large_trays", "review_cards", "open_tickets", "local_receipts",
  "wastage", "staff_meals", "created_by", "created_at",
].join(", ");

const amount = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999_999) throw new BtbApiError("Enter amounts of zero or more.", 400);
  return Math.round(parsed * 100) / 100;
};
const receipts = (value: unknown): string => JSON.stringify(
  Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length <= 400).slice(0, 8) : [],
);

function branchOrLegacy(
  context: { identity: { employeeId?: string | null } },
  location: BtbLocationContext | null,
): BtbLocationContext | null {
  if (!location && context.identity.employeeId) {
    throw new BtbApiError("No branch is assigned to your account. Ask your manager to assign one.", 403);
  }
  return location;
}

export const GET = btbRoute("cash_out", false, async (context, request) => {
  const { db } = context;
  const location = branchOrLegacy(context, await btbRequestLocation(context, request));
  const params = new URL(request.url).searchParams;

  if (params.get("history")) {
    const result = await withLocation(db.from("cash_outs").select(COLUMNS), location)
      .gte("count_date", retentionCutoff(btbToday()))
      .order("count_date", { ascending: false }).limit(100);
    dbError(result.error, "The cash-out history could not be loaded. Please retry.");
    return { rows: result.data ?? [], location: location ? { id: location.id, name: location.name } : null };
  }

  const date = params.get("date");
  if (!isIsoDate(date)) throw new BtbApiError("Choose a valid date.", 400);
  const result = await withLocation(db.from("cash_outs").select(COLUMNS), location)
    .eq("count_date", date).maybeSingle();
  dbError(result.error, "This day could not be loaded. Please retry.");
  return { row: result.data ?? null };
}, { allowLocationWorkspace: true });

export const POST = btbRoute("cash_out", true, async (context, request) => {
  const { db, identity } = context;
  const location = branchOrLegacy(context, await btbRequestLocation(context, request));
  const body = await readBody(request);
  const countDate = body.count_date;
  if (!isIsoDate(countDate)) throw new BtbApiError("Choose a valid date.", 400);
  if (countDate > btbToday()) throw new BtbApiError("A till count cannot be dated in the future.", 400);

  const payload = {
    count_date: countDate,
    till_amount: amount(body.till_amount), cash_sale: amount(body.cash_sale),
    delivery_fees: amount(body.delivery_fees), driver_tips: amount(body.driver_tips),
    cash_out: amount(body.cash_out), safe_drop: amount(body.safe_drop),
    local_purchase: amount(body.local_purchase),
    single_trays: amount(body.single_trays), large_trays: amount(body.large_trays),
    review_cards: amount(body.review_cards), open_tickets: amount(body.open_tickets),
    local_receipts: receipts(body.local_receipts),
    wastage: cleanWastage((Array.isArray(body.wastage) ? body.wastage : []) as { item_name: string; quantity: string | number }[]),
    staff_meals: cleanStaffMeals((Array.isArray(body.staff_meals) ? body.staff_meals : []) as { staff_name: string; item: string; quantity: string | number }[]),
    created_by: identity.name,
  };

  // One till count per branch per day: rewrite the day's row in place instead
  // of stacking a second one.
  const found = await withLocation(
    db.from("cash_outs").select("id").eq("count_date", countDate), location,
  ).limit(1).maybeSingle();
  dbError(found.error, "This day could not be checked. Please retry.");

  if (found.data?.id) {
    const updated = await withLocation(
      db.from("cash_outs").update(payload).eq("id", found.data.id), location,
    ).select(COLUMNS).maybeSingle();
    dbError(updated.error, "The till count could not be saved. Your entries are still here.");
    if (updated.data) return { ok: true, row: updated.data };
  }

  const created = await db.from("cash_outs").insert({ location_id: locationColumn(location), ...payload })
    .select(COLUMNS).single();
  dbError(created.error, "The till count could not be saved. Your entries are still here.");
  return { ok: true, row: created.data };
}, { allowLocationWorkspace: true });
