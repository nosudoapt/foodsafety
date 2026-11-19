import { createHash } from "node:crypto";
import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { amount, financeProblem, FINANCE_ACTIONS, parseBankCsv, type BankCsvMapping, type FinanceAction } from "@/lib/btb-finance";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

export const GET = platformRoute([], async ({ db, employeeId, sessionVersion }, request) => {
  const location = new URL(request.url).searchParams.get("location");
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  return platformRpc(db, "btb_platform_finance_read", {
    p_actor: employeeId, p_session: sessionVersion, p_location: location,
  }, "The invoice, GST and bank records could not be loaded. Retry without making changes.");
});

const failures: Partial<Record<FinanceAction, string>> = {
  bank_import: "The statement could not be imported. Check its dates and that this account has no overlapping statement.",
  bank_match: "The allocation could not be saved. Reload and check the remaining bank amount and invoice balance.",
  bank_unmatch: "The allocation could not be undone. Reopen its statement and reload the latest transaction first.",
  bank_finalize: "The statement could not be reconciled. Verify opening/closing balances and fully allocate every transaction.",
  bank_balances: "The balances could not be saved. Reopen the statement, reload it, and verify both actual balances.",
  gst_finalize: "The GST period could not be finalized. Review every purchase document and tax breakdown, and confirm complete sales and purchases.",
  invoice_tax: "The tax breakdown could not be saved. Check the total and reopen any finalized inventory or GST period first.",
};
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 4_400_000);
  if (!isUuid(body.location_id) || !isUuid(body.request_id)) throw new BtbApiError("Choose a location and start a new finance request.");
  const action = body.action as FinanceAction;
  if (!FINANCE_ACTIONS.includes(action) || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new BtbApiError("Send a valid finance action.");
  let data = body.data as Record<string, unknown>;
  const problem = financeProblem(action, data);
  if (problem) throw new BtbApiError(problem);
  if (action === "bank_import") {
    if (!isUuid(data.id) || !isUuid(data.account_id) || typeof data.name !== "string" || !data.name.trim() || data.name.length > 200 || typeof data.raw_csv !== "string") throw new BtbApiError("Choose the bank account and its source CSV.");
    for (const key of ["opening_balance", "closing_balance"]) {
      if (data[key] != null && amount(data[key], true) === null) throw new BtbApiError("Enter valid balances, or leave unknown balances blank. Reconciliation requires both balances.");
    }
    if (typeof data.balances_confirmed !== "boolean" || data.balances_confirmed && (data.opening_balance == null || data.closing_balance == null)) throw new BtbApiError("Confirm balances only when both were verified from the actual statement.");
    if (!data.mapping || typeof data.mapping !== "object" || Array.isArray(data.mapping)) throw new BtbApiError("Map the CSV columns before importing.");
    const parsed = parseBankCsv(data.raw_csv, data.mapping as BankCsvMapping, String(data.from_date), String(data.to_date));
    if (!parsed.ok) throw new BtbApiError(parsed.error);
    // Never trust browser-provided rows, sums or hashes. Preserve source evidence.
    data = { ...data, transactions: parsed.value, sha256: createHash("sha256").update(data.raw_csv, "utf8").digest("hex") };
  }
  const result = await platformRpc(db, "btb_platform_finance", {
    p_actor: employeeId, p_session: sessionVersion, p_location: body.location_id,
    p_request: body.request_id, p_action: action, p_data: data,
  }, failures[action] ?? "The finance change could not be saved. Your draft is still here; check the record and try again.");
  return { result };
});
