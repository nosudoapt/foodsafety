import test from "node:test";
import assert from "node:assert/strict";
import { amount, stockQuantity, cents, fromCents, taxProblem, invoiceStatus, gstEstimate, priceChange, financeProblem, validPeriod, readCsv, parseBankCsv, suggestedInvoices, csvDocument, type Invoice, type BankTransaction, type BankCsvMapping, type SupplierPrice } from "../src/lib/btb-finance";

const id = "10000000-0000-4000-8000-000000000001";
const invoice = (changes: Partial<Invoice> = {}): Invoice => ({ id, purchase_id: id, import_id: id, file_id: id, location_id: id, vendor: "Gordon Now", reference: "INV-123", invoice_date: "2026-11-03", due_date: "2026-11-30", total: 105, subtotal: 100, gst: 5, other_tax: 0, charges: 0, tax_confirmed: true, itc_eligible: true, notes: "", version: 1, voided_at: null, paid: 0, outstanding: 105, ...changes });
const transaction = (changes: Partial<BankTransaction> = {}): BankTransaction => ({ id, statement_id: id, transaction_date: "2026-11-03", description: "Gordon Now payment", reference: null, amount: -105, allocated: 0, version: 1, ...changes });
const mapping: BankCsvMapping = { date: 0, description: 1, amount: 2, debit: null, credit: null, reference: null, date_format: "iso" };
const period = { from_date: "2026-11-01", to_date: "2026-11-30", collected: 20, adjustments: 0, purchases_complete: true, sales_complete: true };

test("money and stock quantities require explicit bounded decimals, not coercible missing values", () => {
  for (const value of [null, undefined, "", " ", false, [], {}, "1e2", "0x10", "$12", "1,000", "+1", "1.001", Number.NaN, Infinity]) assert.equal(amount(value), null, String(value));
  assert.equal(amount("0"), 0); assert.equal(amount(" 12.50 "), 12.5);
  assert.equal(amount("-12.50"), null); assert.equal(amount("-12.50", true), -12.5);
  assert.equal(amount(1_000_000_000), null);
  assert.equal(stockQuantity("1.2345"), 1.2345); assert.equal(stockQuantity("1.23456"), null);
  assert.equal(stockQuantity("-0.0001", true), -0.0001); assert.equal(stockQuantity("-1"), null);
  assert.equal(fromCents(cents(0.1) + cents(0.2)), 0.3);
});

test("tax verification requires every source amount and explicit ITC eligibility, including verified zero", () => {
  const values = { total: 105, subtotal: 100, gst: 5, other_tax: 0, charges: 0, itc_eligible: true };
  assert.equal(taxProblem(values), null);
  for (const key of ["total", "subtotal", "gst", "other_tax", "charges", "itc_eligible"]) assert.ok(taxProblem({ ...values, [key]: null }), key);
  assert.match(taxProblem({ ...values, gst: 4.99 })!, /must equal/);
  assert.equal(taxProblem({ total: 0.3, subtotal: 0.1, gst: 0.2, other_tax: 0, charges: 0, itc_eligible: false }), null);
});

test("invoice status respects due dates, partial payments, verified zero invoices and retained voids", () => {
  assert.equal(invoiceStatus(invoice(), "2026-11-18"), "unpaid");
  assert.equal(invoiceStatus(invoice({ due_date: "2026-11-17" }), "2026-11-18"), "overdue");
  assert.equal(invoiceStatus(invoice({ due_date: "2026-11-18" }), "2026-11-18"), "unpaid");
  assert.equal(invoiceStatus(invoice({ due_date: null, paid: 40, outstanding: 65 }), "2026-11-18"), "part-paid");
  assert.equal(invoiceStatus(invoice({ paid: 105, outstanding: 0 }), "2026-11-18"), "paid");
  assert.equal(invoiceStatus(invoice({ total: 0, outstanding: 0 }), "2026-11-18"), "paid");
  assert.equal(invoiceStatus(invoice({ voided_at: "2026-11-18T00:00:00Z", outstanding: 0 }), "2026-11-18"), "voided");
});

test("GST estimates remain missing until purchases, taxes, eligibility and sales are explicitly verified", () => {
  assert.deepEqual(gstEstimate([invoice()], period), { inputTax: 5, netDue: 15, missing: 0 });
  assert.deepEqual(gstEstimate([invoice({ itc_eligible: false })], period), { inputTax: 0, netDue: 20, missing: 0 });
  assert.deepEqual(gstEstimate([], { ...period, collected: 0 }), { inputTax: 0, netDue: 0, missing: 0 });
  for (const changes of [{ gst: null }, { tax_confirmed: false }, { itc_eligible: null }, { gst: Number.NaN }]) assert.deepEqual(gstEstimate([invoice(changes)], period), { inputTax: null, netDue: null, missing: 1 });
  for (const changes of [{ purchases_complete: false }, { from_date: "2026-12-01" }]) assert.equal(gstEstimate([invoice()], { ...period, ...changes }).inputTax, null);
  for (const changes of [{ sales_complete: false }, { collected: null }, { adjustments: null }, { collected: Number.NaN }]) {
    const estimate = gstEstimate([invoice()], { ...period, ...changes }); assert.equal(estimate.inputTax, 5); assert.equal(estimate.netDue, null);
  }
  assert.deepEqual(gstEstimate([invoice({ voided_at: "2026-11-18T00:00:00Z", gst: null }), invoice({ invoice_date: "2026-10-31", tax_confirmed: false })], period), { inputTax: 0, netDue: 20, missing: 0 });
});

test("supplier price changes compare only matching units, suppliers and items, ordered by invoice date", () => {
  const price = (key: string, changes: Partial<SupplierPrice> = {}): SupplierPrice => ({ id: key, item_id: id, purchase_id: id, vendor: "Gordon Now", price_basis: "case", price: 50, invoice_date: "2026-11-03", created_at: "2026-11-18T00:00:00Z", voided: false, derived: false, apply_catalog: true, ...changes });
  const current = price("current", { invoice_date: "2026-11-05", price: 60 });
  const earlier = price("previous");
  assert.deepEqual(priceChange([current, price("void", { price: 90, voided: true }), price("packet", { price_basis: "packet" }), price("supplier", { vendor: "Other" }), price("item", { item_id: "other" }), earlier], current), { previous: 50, difference: 10, percent: 20 });
  assert.deepEqual(priceChange([earlier], earlier), { previous: null, difference: null, percent: null });
  assert.equal(priceChange([price("zero", { price: 0 }), current], current).percent, null);
});

test("finance commands reject stale/missing versions, implicit correction reasons and incomplete fields", () => {
  assert.match(financeProblem("stock_count", { id, version: 0, cases: 0, packets: 0 })!, /reason/);
  assert.equal(financeProblem("stock_count", { id, version: 0, cases: 0, packets: 0, reason: "Physical baseline" }), null);
  assert.match(financeProblem("stock_adjust", { id, version: 1, cases: null, packets: -1, reason: "Waste" })!, /explicitly/);
  assert.match(financeProblem("bank_finalize", { id, version: "1" })!, /Reload/);
  assert.match(financeProblem("bank_match", { id, version: 1, transaction_id: id, amount: 10, allocation_id: id, category: "invented" })!, /category/);
  assert.match(financeProblem("bank_balances", { id, version: 1, opening_balance: null, closing_balance: 0, balances_confirmed: true, reason: "Statement" })!, /both balances/);
  assert.match(financeProblem("gst_file", { id, version: 1, filed_on: "2026-02-30", filing_reference: "fixture" })!, /actual filing/);
  assert.equal(validPeriod("2026-11-01", "2026-11-30"), true);
  assert.equal(validPeriod("2026-11-30", "2026-11-01"), false);
  assert.equal(validPeriod("2026-01-01", "2027-01-02"), false);
});

test("CSV quoting preserves BOM, commas, escaped quotes, Unicode, embedded newlines and physical source rows", () => {
  const raw = '\uFEFFDate,Description,Amount,Reference\r\n2026-11-03,"Gordon, ""Now""\r\n食材","($1,234.50)",INV-123\r\n2026-11-04,Sales,$100.00,\r\n';
  const parsed = parseBankCsv(raw, { ...mapping, reference: 3 }, period.from_date, period.to_date);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, [{ line_number: 2, transaction_date: "2026-11-03", description: 'Gordon, "Now"\r\n食材', reference: "INV-123", amount: -1234.5 }, { line_number: 4, transaction_date: "2026-11-04", description: "Sales", reference: null, amount: 100 }]);
  const rows = readCsv(raw); assert.equal(rows.ok && rows.value.length, 3);
});

test("CSV rejects blank, malformed, excess, zero, out-of-period and ambiguous unmapped rows without partial imports", () => {
  const invalid = [
    "Date,Description,Amount\n2026-11-03,GFS,-10\n\n2026-11-04,Sales,20",
    "Date,Description,Amount\n2026-11-03,GFS,-10\n2026-11-04,Sales,20,extra",
    'Date,Description,Amount\n2026-11-03,"unterminated,-10',
    'Date,Description,Amount\n2026-11-03,"closed"junk,-10',
    'Date,Description,Amount\n2026-11-03,un"quoted,-10',
    "Date,Description,Amount\n2026-11-03,GFS,0",
    "Date,Description,Amount\n2026-10-31,GFS,-10",
    "Date,Description,Amount\n2026-11-03,GFS,1e2",
    'Date,Description,Amount\n2026-11-03,GFS,"1,00.00"',
  ];
  for (const raw of invalid) assert.equal(parseBankCsv(raw, mapping, period.from_date, period.to_date).ok, false, raw);
  const blank = parseBankCsv(invalid[0], mapping, period.from_date, period.to_date); assert.match(!blank.ok ? blank.error : "", /CSV row 3.*blank/);
  const raw = "Date,Description,Amount\n2026-11-03,GFS,-10";
  for (const broken of [null, {}, { ...mapping, date: null }, { ...mapping, description: null }, { ...mapping, amount: undefined }, { ...mapping, date: "0" }, { ...mapping, description: 0 }, { ...mapping, date_format: "automatic" }]) {
    assert.equal(parseBankCsv(raw, broken as BankCsvMapping, period.from_date, period.to_date).ok, false, JSON.stringify(broken));
  }
  assert.equal(readCsv("Date,Description,Amount").ok, false);
  assert.equal(readCsv("a".repeat(3_145_729)).ok, false);
  assert.equal(parseBankCsv("Date,Description,Amount\n" + "2026-11-03,GFS,-1\n".repeat(5001), mapping, period.from_date, period.to_date).ok, false);
});

test("bank CSV dates require the selected format and debit/credit columns have explicit sign rules", () => {
  const raw = "Date,Description,Debit,Credit\n03/11/2026,GFS,40,\n04/11/2026,Sales,,100\n";
  const separate: BankCsvMapping = { ...mapping, amount: null, debit: 2, credit: 3, date_format: "dmy" };
  const parsed = parseBankCsv(raw, separate, period.from_date, period.to_date);
  assert.equal(parsed.ok, true); if (parsed.ok) assert.deepEqual(parsed.value.map((row) => row.amount), [-40, 100]);
  assert.equal(parseBankCsv(raw, { ...separate, date_format: "mdy" }, period.from_date, period.to_date).ok, false);
  for (const cells of ["40,20", ",", "-40,", "0,0"]) assert.equal(parseBankCsv(`Date,Description,Debit,Credit\n03/11/2026,GFS,${cells}`, separate, period.from_date, period.to_date).ok, false, cells);
  assert.equal(parseBankCsv(raw, { ...separate, amount: 2 }, period.from_date, period.to_date).ok, false);
});

test("invoice suggestions require identity plus the exact remaining amount and never change data", () => {
  const invoices = [invoice(), invoice({ id: "other", vendor: "Other supplier", reference: "OTHER" }), invoice({ id: "void", voided_at: "2026-11-18T00:00:00Z" })];
  const before = JSON.stringify(invoices);
  assert.deepEqual(suggestedInvoices(transaction(), invoices).map((row) => row.id), [id]);
  assert.deepEqual(suggestedInvoices(transaction({ description: "Withdrawal" }), invoices), []);
  assert.deepEqual(suggestedInvoices(transaction({ description: "INV-123", amount: -145, allocated: 40 }), invoices).map((row) => row.id), [id]);
  assert.deepEqual(suggestedInvoices(transaction({ amount: 105 }), invoices), []);
  assert.equal(JSON.stringify(invoices), before);
});

test("CSV exports quote fields and neutralize spreadsheet formulas without corrupting numeric negatives", () => {
  const output = csvDocument([["=SUM(1,2)", "+formula", "-formula", "@formula", "\tformula", 'Text "quoted"', -10, null]]);
  assert.equal(output, '"\'=SUM(1,2)","\'+formula","\'-formula","\'@formula","\'\tformula","Text ""quoted""","-10",""\r\n');
});
