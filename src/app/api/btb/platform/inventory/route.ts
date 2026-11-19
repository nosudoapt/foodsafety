import { BtbApiError, readBody } from "@/lib/btb-api";
import { isIsoDate, isUuid } from "@/lib/btb-team";
import { INVENTORY_ACTIONS, type InventoryAction } from "@/lib/btb-platform-inventory";
import { amount, stockQuantity, taxProblem } from "@/lib/btb-finance";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * One transactional inventory command per request. The SQL function is the
 * authorization boundary: it re-checks the actor, credential version,
 * location membership and (for corporate-only steps) role, then either commits
 * the whole change or rolls it back.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 512_000);
  const location = body.location_id;
  const action = body.action as InventoryAction;
  const month = body.month;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (!INVENTORY_ACTIONS.includes(action)) throw new BtbApiError("Choose an inventory action.");
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BtbApiError("Choose a valid accounting month.");
  const data = body.data;
  if (data != null && (typeof data !== "object" || Array.isArray(data))) throw new BtbApiError("Send a valid inventory form.");
  if (action === "confirm_purchase") {
    const purchase = (data ?? {}) as Record<string, unknown>;
    if (!isUuid(purchase.import_id) || !isIsoDate(purchase.date) || purchase.date.slice(0, 7) !== month || amount(purchase.total) === null || purchase.review_confirmed !== true) throw new BtbApiError("Review the source, invoice date and CAD total (up to two decimal places) before confirming.");
    if (purchase.due_date != null && !isIsoDate(purchase.due_date)) throw new BtbApiError("Enter a valid invoice due date, or leave it missing.");
    if (purchase.tax_confirmed === true) { const problem = taxProblem(purchase as Parameters<typeof taxProblem>[0]); if (problem) throw new BtbApiError(problem); }
    if (!Array.isArray(purchase.lines) || !purchase.lines.length || purchase.lines.length > 2000) throw new BtbApiError("Review at least one purchased line.");
    for (const line of purchase.lines) {
      if (!line || typeof line !== "object" || Array.isArray(line) || typeof line.description !== "string" || !line.description.trim() || stockQuantity(line.cases) === null || stockQuantity(line.packets) === null || amount(line.line_total) === null) throw new BtbApiError("Enter descriptions, quantities and totals for every invoice line.");
      if (line.item_id != null ? !isUuid(line.item_id) : line.stock_excluded !== true) throw new BtbApiError("Map every line to stock, or explicitly mark it as a non-stock expense.");
      if (line.item_id && line.stock_excluded) throw new BtbApiError("A mapped stock line cannot also be excluded from stock.");
      if (line.unit_price != null && (stockQuantity(line.unit_price) === null || !["case", "packet"].includes(line.price_basis))) throw new BtbApiError("Confirm each printed price (up to four decimals) and whether it is per case or packet.");
    }
  }
  const result = await platformRpc(db, "btb_platform_inventory_finance", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_month: month,
    p_action: action,
    p_data: data ?? {},
  }, action === "finalize" ? "The month could not be finalized. Complete all counts, purchases and sales, and verify invoice GST and purchase costing first." : "The inventory change could not be saved. Check the reviewed fields and reopen finalized inventory/GST periods before correcting source invoices.");
  return { result };
});
