// Secret-free finance contracts, decimal validation and CSV import/export.
import { isIsoDate, isUuid } from "./btb-team";
import type { InventoryItem } from "./btb-platform-inventory";
import type { PlatformParse } from "./btb-platform";

export interface Invoice {
  id: string; purchase_id: string; import_id: string; file_id: string;
  location_id: string; vendor: string; reference: string | null; invoice_date: string;
  due_date: string | null; total: number; subtotal: number | null; gst: number | null;
  other_tax: number | null; charges: number | null; tax_confirmed: boolean;
  itc_eligible: boolean | null; notes: string; version: number; voided_at: string | null;
  paid: number; outstanding: number;
}
export interface BankAccount { id: string; name: string }
export interface BankStatement {
  id: string; account_id: string; name: string; from_date: string; to_date: string;
  opening_balance: number | null; closing_balance: number | null; transaction_total: number;
  balances_confirmed: boolean;
  status: "draft" | "reconciled"; version: number; reconciled_at: string | null;
}
export interface BankTransaction {
  id: string; statement_id: string; transaction_date: string; description: string;
  reference: string | null; amount: number; allocated: number; version: number;
}
export interface BankAllocation {
  id: string; transaction_id: string; invoice_id: string | null; amount: number;
  category: string | null; notes: string; created_at: string; voided_at: string | null;
}
export interface GstPeriod {
  id: string; from_date: string; to_date: string; collected: number | null;
  adjustments: number | null; purchases_complete: boolean; sales_complete: boolean;
  input_tax: number | null; net_due: number | null; status: "draft" | "finalized" | "filed";
  version: number; notes: string; filed_on: string | null; filing_reference: string | null;
}
export interface StockItem extends InventoryItem {
  balance_version: number; baseline_at: string | null; on_hand_packets: number | null;
  received_packets: number;
}
export interface SupplierPrice {
  id: string; item_id: string; purchase_id: string; vendor: string; price_basis: "case" | "packet";
  price: number; invoice_date: string; created_at: string; voided: boolean;
  derived: boolean; apply_catalog: boolean;
}
export interface StockMovement {
  id: string; item_id: string; purchase_id: string | null; kind: "receipt" | "void" | "adjustment";
  packet_delta: number; pack_size: number; effective_at: string; created_at: string; reason: string | null;
}
export interface FinanceData {
  invoices: Invoice[]; accounts: BankAccount[]; statements: BankStatement[];
  transactions: BankTransaction[]; allocations: BankAllocation[]; gst_periods: GstPeriod[];
  stock: StockItem[]; prices: SupplierPrice[]; movements: StockMovement[];
  audit: { id: string; entity_type: string; action: string; actor_name: string; reason: string | null; created_at: string }[];
}

export function amount(value: unknown, signed = false): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Math.abs(number) <= 999_999_999 ? number : null;
}
export const cents = (value: number) => Math.round(value * 100);
export const fromCents = (value: number) => value / 100;
export function stockQuantity(value: unknown, signed = false): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!(signed ? /^-?\d+(\.\d{1,4})?$/ : /^\d+(\.\d{1,4})?$/).test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Math.abs(number) <= 99_999_999 ? number : null;
}
export function taxProblem(values: { total: unknown; subtotal: unknown; gst: unknown; other_tax: unknown; charges: unknown; itc_eligible: unknown }): string | null {
  const parts = [values.subtotal, values.gst, values.other_tax, values.charges].map((value) => amount(value));
  const total = amount(values.total);
  if (total === null || parts.some((value) => value === null)) return "Enter subtotal, GST, other tax and charges explicitly (0 only when verified).";
  if (typeof values.itc_eligible !== "boolean") return "Confirm whether the GST is eligible for an input tax credit with your accountant.";
  if (parts.reduce<number>((sum, value) => sum + cents(value!), 0) !== cents(total)) return "Subtotal + GST + other tax + charges must equal the invoice total.";
  return null;
}
export function invoiceStatus(invoice: Invoice, today: string): "voided" | "paid" | "overdue" | "part-paid" | "unpaid" {
  if (invoice.voided_at) return "voided";
  if (cents(invoice.outstanding) <= 0) return "paid";
  if (invoice.due_date && invoice.due_date < today) return "overdue";
  return cents(invoice.paid) > 0 ? "part-paid" : "unpaid";
}
export function gstEstimate(invoices: readonly Invoice[], period: Pick<GstPeriod, "from_date" | "to_date" | "collected" | "adjustments" | "purchases_complete" | "sales_complete">) {
  const relevant = invoices.filter((invoice) => !invoice.voided_at && invoice.invoice_date >= period.from_date && invoice.invoice_date <= period.to_date);
  const missing = relevant.filter((invoice) => invoice.tax_confirmed !== true || amount(invoice.gst) === null || typeof invoice.itc_eligible !== "boolean").length;
  const inputTax = validPeriod(period.from_date, period.to_date) && period.purchases_complete === true && missing === 0
    ? fromCents(relevant.reduce((sum, invoice) => sum + (invoice.itc_eligible ? cents(invoice.gst!) : 0), 0)) : null;
  const collected = amount(period.collected), adjustments = amount(period.adjustments, true);
  const netDue = inputTax !== null && period.sales_complete === true && collected !== null && adjustments !== null
    ? fromCents(cents(collected) - cents(inputTax) + cents(adjustments)) : null;
  return { inputTax, netDue, missing };
}
export function priceChange(prices: readonly SupplierPrice[], current: SupplierPrice) {
  const sequence = prices.filter((price) => !price.voided && price.item_id === current.item_id && price.vendor.toLowerCase() === current.vendor.toLowerCase() && price.price_basis === current.price_basis)
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const index = sequence.findIndex((price) => price.id === current.id);
  const previous = index > 0 ? sequence[index - 1].price : null;
  return { previous, difference: previous === null ? null : current.price - previous,
    percent: previous === null || previous === 0 ? null : (current.price - previous) / previous * 100 };
}

export const BANK_CATEGORIES = ["sales", "fees", "rent", "payroll", "utilities", "tax", "transfer", "refund", "other"] as const;
export const FINANCE_ACTIONS = ["invoice_terms", "invoice_tax", "stock_count", "stock_adjust", "bank_account", "bank_import", "bank_balances", "bank_match", "bank_unmatch", "bank_finalize", "bank_reopen", "gst_save", "gst_finalize", "gst_reopen", "gst_file"] as const;
export type FinanceAction = (typeof FINANCE_ACTIONS)[number];
const versionOk = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const textOk = (value: unknown, max = 2000) => value == null || typeof value === "string" && value.length <= max;
export function validPeriod(from: unknown, to: unknown): boolean {
  return isIsoDate(from) && isIsoDate(to) && from <= to && Date.parse(to) - Date.parse(from) <= 365 * 86_400_000;
}
export function financeProblem(action: FinanceAction, data: Record<string, unknown>): string | null {
  if (!textOk(data.notes) || !textOk(data.reason)) return "Keep notes and reasons under 2,000 characters.";
  if (action !== "bank_import" && action !== "bank_account" && (!isUuid(data.id) || !versionOk(data.version))) return "Reload this saved record before editing it.";
  if (["bank_balances", "bank_unmatch", "bank_reopen", "gst_reopen", "stock_count", "stock_adjust"].includes(action) && (typeof data.reason !== "string" || !data.reason.trim())) return "Enter the reason for this correction.";
  if (action === "invoice_terms" && data.due_date != null && !isIsoDate(data.due_date)) return "Enter a valid due date or leave it blank.";
  if (action === "invoice_tax") return taxProblem(data as Parameters<typeof taxProblem>[0]);
  if (action === "stock_count" || action === "stock_adjust") {
    if (stockQuantity(data.cases, action === "stock_adjust") === null || stockQuantity(data.packets, action === "stock_adjust") === null) return "Enter cases and packets explicitly (up to four decimal places).";
  }
  if (action === "bank_account" && (!isUuid(data.id) || typeof data.name !== "string" || !data.name.trim() || data.name.length > 120)) return "Name this bank account (up to 120 characters).";
  if (action === "bank_balances" && (amount(data.opening_balance, true) === null || amount(data.closing_balance, true) === null || data.balances_confirmed !== true)) return "Check both balances against the actual statement and confirm them.";
  if (action === "bank_match") {
    if (!isUuid(data.transaction_id) || amount(data.amount) === null || Number(data.amount) <= 0) return "Choose a transaction and a positive allocation amount.";
    if (data.invoice_id != null ? !isUuid(data.invoice_id) : !BANK_CATEGORIES.includes(data.category as typeof BANK_CATEGORIES[number])) return "Choose an invoice or a bookkeeping category.";
    if (!isUuid(data.allocation_id)) return "Start a new allocation and try again.";
  }
  if (action === "gst_save") {
    if (!validPeriod(data.from_date, data.to_date)) return "Choose a GST period of no more than one year.";
    if (data.collected != null && amount(data.collected) === null || data.adjustments != null && amount(data.adjustments, true) === null) return "Enter valid GST amounts; blank is missing, not zero.";
    if (typeof data.purchases_complete !== "boolean" || typeof data.sales_complete !== "boolean") return "Confirm whether purchases and sales are complete.";
  }
  if (action === "gst_file" && (!isIsoDate(data.filed_on) || typeof data.filing_reference !== "string" || !data.filing_reference.trim() || data.filing_reference.length > 200)) return "Enter the actual filing date and confirmation reference.";
  return null;
}

export interface BankCsvMapping {
  date: number; description: number; amount: number | null; debit: number | null; credit: number | null;
  reference: number | null; date_format: "iso" | "dmy" | "mdy";
}
export interface BankImportRow { line_number: number; transaction_date: string; description: string; reference: string | null; amount: number }

interface CsvRecord { cells: string[]; line_number: number }
/** Preserve blank records and each record's physical source line for review. */
function csvRecords(source: string): PlatformParse<CsvRecord[]> {
  if (source.length > 3_145_728) return { ok: false, error: "Choose a CSV no larger than 3 MB." };
  const rows: CsvRecord[] = []; let row: string[] = [], cell = "", quoted = false, closed = false, line = 1, firstLine = 1;
  const pushRow = () => { row.push(cell); rows.push({ cells: row, line_number: firstLine }); row = []; cell = ""; closed = false; };
  const text = source.replace(/^\uFEFF/, "");
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') { cell += '"'; at++; }
      else if (char === '"') { quoted = false; closed = true; }
      else { cell += char; if (char === "\n" || char === "\r" && text[at + 1] !== "\n") line++; }
    } else if (char === '"') {
      if (cell || closed) return { ok: false, error: "The CSV has an unexpected quote. Export it again from your bank." };
      quoted = true;
    } else if (char === ",") { row.push(cell); cell = ""; closed = false; }
    else if (char === "\n" || char === "\r") { pushRow(); if (char === "\r" && text[at + 1] === "\n") at++; line++; firstLine = line; }
    else if (closed) return { ok: false, error: "The CSV has text after a closing quote. Export it again from your bank." };
    else cell += char;
  }
  if (quoted) return { ok: false, error: "The CSV ends inside a quoted field." };
  if (row.length || cell || closed || text && !/[\r\n]$/.test(text)) pushRow();
  if (rows.length < 2 || rows.length > 5001) return { ok: false, error: "Choose a CSV with a header and 1–5,000 transactions." };
  return { ok: true, value: rows };
}
/** RFC 4180 quoting, BOM and CRLF; no silently dropped malformed rows. */
export function readCsv(source: string): PlatformParse<string[][]> {
  const parsed = csvRecords(source);
  return parsed.ok ? { ok: true, value: parsed.value.map((record) => record.cells) } : parsed;
}
function bankDate(raw: string, format: BankCsvMapping["date_format"]): string | null {
  const text = raw.trim();
  if (format === "iso") return isIsoDate(text) ? text : null;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (!match) return null;
  const first = match[1].padStart(2, "0"), second = match[2].padStart(2, "0");
  const iso = `${match[3]}-${format === "dmy" ? second : first}-${format === "dmy" ? first : second}`;
  return isIsoDate(iso) ? iso : null;
}
function bankMoney(raw: string, signed = true): number | null {
  let text = raw.trim();
  if (/^\(.*\)$/.test(text)) text = "-" + text.slice(1, -1);
  text = text.replace(/^(\-?)\$\s*/, "$1");
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  return amount(text.replace(/,/g, ""), signed);
}
export function parseBankCsv(source: string, mapping: BankCsvMapping, from: string, to: string): PlatformParse<BankImportRow[]> {
  const parsed = csvRecords(source);
  if (!parsed.ok) return parsed;
  if (!validPeriod(from, to)) return { ok: false, error: "Choose valid statement dates (no more than one year)." };
  const columns = parsed.value[0].cells.length;
  const columnOk = (index: unknown): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < columns;
  if (!mapping || typeof mapping !== "object" || !columnOk(mapping.date) || !columnOk(mapping.description)) return { ok: false, error: "Map the required date and description columns explicitly." };
  const used = [mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit, mapping.reference].filter((value) => value !== null);
  if (!used.every(columnOk) || new Set(used).size !== used.length || !["iso", "dmy", "mdy"].includes(mapping.date_format)
    || mapping.amount === null && (mapping.debit === null || mapping.credit === null) || mapping.amount !== null && (mapping.debit !== null || mapping.credit !== null)) return { ok: false, error: "Map distinct date, description and amount columns, or separate debit and credit columns." };
  const result: BankImportRow[] = [];
  for (const { cells: row, line_number } of parsed.value.slice(1)) {
    const where = `CSV row ${line_number}`;
    if (!row.some((value) => value.trim())) return { ok: false, error: `${where}: a blank transaction row cannot be silently skipped. Check the source CSV.` };
    if (row.length !== columns) return { ok: false, error: `${where}: the number of columns does not match the header.` };
    const transaction_date = bankDate(row[mapping.date], mapping.date_format);
    if (!transaction_date || transaction_date < from || transaction_date > to) return { ok: false, error: `${where}: enter a valid date inside the statement period.` };
    const description = row[mapping.description].trim();
    if (!description || description.length > 1000) return { ok: false, error: `${where}: the description is missing or longer than 1,000 characters.` };
    let value: number | null;
    if (mapping.amount !== null) value = bankMoney(row[mapping.amount]);
    else {
      const debitRaw = row[mapping.debit!].trim(), creditRaw = row[mapping.credit!].trim();
      const debit = debitRaw ? bankMoney(debitRaw, false) : 0, credit = creditRaw ? bankMoney(creditRaw, false) : 0;
      value = !debitRaw && !creditRaw || debit === null || credit === null || debit > 0 && credit > 0 ? null : fromCents(cents(credit!) - cents(debit!));
    }
    if (value === null || value === 0) return { ok: false, error: `${where}: enter a nonzero amount (negative for withdrawals, positive for deposits).` };
    const reference = mapping.reference === null ? null : row[mapping.reference].trim() || null;
    if (reference && reference.length > 200) return { ok: false, error: `${where}: keep the reference under 200 characters.` };
    result.push({ line_number, transaction_date, description, reference, amount: value });
  }
  return { ok: true, value: result };
}

/** Suggestions do not mutate records. Equal amounts alone are not a match. */
export function suggestedInvoices(transaction: BankTransaction, invoices: readonly Invoice[]): Invoice[] {
  if (transaction.amount >= 0) return [];
  const text = `${transaction.description} ${transaction.reference ?? ""}`.toLowerCase();
  return invoices.filter((invoice) => !invoice.voided_at && invoice.outstanding > 0 && cents(invoice.outstanding) === cents(Math.abs(transaction.amount) - transaction.allocated)
    && (invoice.reference && text.includes(invoice.reference.toLowerCase()) || invoice.vendor.length >= 3 && text.includes(invoice.vendor.toLowerCase())));
}
export function csvDocument(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows.map((row) => row.map((value) => {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
