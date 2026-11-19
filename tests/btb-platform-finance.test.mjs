import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createPlatformDatabase, seedPlatform, IDS, call, platformImport } from "./helpers/btb-platform-database.mjs";

const manager = { p_actor: IDS.manager, p_session: 1, p_location: IDS.a };
const finance = (db, action, data, context = manager, request = randomUUID()) => call(db, "btb_platform_finance", { ...context, p_request: request, p_action: action, p_data: data });
const inventory = (db, action, data) => call(db, "btb_platform_inventory_finance", { ...manager, p_month: "2026-11", p_action: action, p_data: data });
const read = (db, context = manager) => call(db, "btb_platform_finance_read", context);
async function fixture(t) {
  const db = await createPlatformDatabase(); t.after(() => db.close()); await seedPlatform(db);
  await inventory(db, "items", { review_confirmed: true, items: [{ name: "Fixture ingredient", item_number: "TEST-1", source: "gfs", pack_size: 10, case_price: 40, packet_price: 4 }] });
  return { db, item: (await read(db)).stock[0] };
}
async function purchase(db, item, overrides = {}) {
  const doc = await platformImport(db, "gfs");
  const data = { import_id: doc.id, vendor: "Gordon Now", reference: randomUUID(), date: "2026-11-03", due_date: "2026-11-30", currency: "CAD", total: 105,
    subtotal: 100, gst: 5, other_tax: 0, charges: 0, tax_confirmed: true, itc_eligible: true, update_prices: true, review_confirmed: true,
    lines: [{ item_id: item.id, description: item.name, cases: 2, packets: 0, unit_price: 50, price_basis: "case", line_total: 100, stock_excluded: false }], ...overrides };
  return { data, result: await inventory(db, "confirm_purchase", data) };
}

test("one approved source atomically posts invoice, receipt, GST cost and comparable prices; retries do not post twice", async (t) => {
  const { db, item } = await fixture(t);
  await db.exec("SET ROLE service_role");
  const first = await purchase(db, item);
  const replay = await inventory(db, "confirm_purchase", first.data);
  assert.equal(replay.id, first.result.id); assert.equal(replay.replayed, true);
  let data = await read(db);
  assert.equal(data.invoices.length, 1); assert.equal(data.invoices[0].total, 105);
  assert.equal(data.invoices[0].outstanding, 105); assert.equal(data.stock[0].on_hand_packets, null);
  assert.equal(data.stock[0].received_packets, 20); assert.equal(data.stock[0].balance_version, 1);
  assert.equal(data.stock[0].case_price, 50); assert.equal(data.stock[0].packet_price, 5);
  assert.equal(data.prices.length, 2);
  assert.equal((await db.query("SELECT amount FROM inventory_purchases WHERE id=$1", [first.result.id])).rows[0].amount, "100.00");
  await assert.rejects(finance(db, "stock_count", { id: item.id, version: 0, cases: 1, packets: 0, reason: "Count begun before delivery" }), /changed/);
  await finance(db, "stock_count", { id: item.id, version: 1, cases: 1, packets: 0, reason: "Physical baseline after delivery" });
  data = await read(db); assert.equal(data.stock[0].on_hand_packets, 10, "receipts already included in the baseline are not added again");
  const second = await purchase(db, item, { reference: "TEST-2", update_prices: false });
  data = await read(db); assert.equal(data.stock[0].on_hand_packets, 30); assert.equal(data.stock[0].balance_version, 3);
  await assert.rejects(finance(db, "stock_adjust", { id: item.id, version: 2, cases: 0, packets: -1, reason: "Stale draft" }), /changed/);
  await inventory(db, "void_purchase", { id: second.result.id, reason: "Duplicate delivery record" });
  data = await read(db); assert.equal(data.stock[0].on_hand_packets, 10); assert.equal(data.stock[0].balance_version, 4);
  await inventory(db, "void_purchase", { id: first.result.id, reason: "Duplicate document only, stock recounted" });
  data = await read(db); assert.equal(data.stock[0].case_price, 40); assert.equal(data.stock[0].packet_price, 4);
  assert.equal(data.stock[0].on_hand_packets, 10, "a historical receipt preceding the last physical baseline is not deducted from that count");
  await assert.rejects(db.exec("UPDATE btb_stock_movements SET packet_delta=0"), /permission denied/);
  await assert.rejects(db.exec("UPDATE btb_supplier_prices SET price=0"), /permission denied/);
});

test("unmapped lines and inexact tax roll back; explicitly excluded expenses never fabricate stock", async (t) => {
  const { db, item } = await fixture(t);
  const doc = await platformImport(db, "local");
  const data = { import_id: doc.id, vendor: "Fixture expense", reference: "EXPENSE-1", date: "2026-11-03", currency: "CAD", total: 10, review_confirmed: true,
    lines: [{ description: "Delivery fee", cases: 0, packets: 0, line_total: 10, stock_excluded: false }] };
  await assert.rejects(inventory(db, "confirm_purchase", data), /Map the stock item/);
  await assert.rejects(inventory(db, "confirm_purchase", { ...data, tax_confirmed: true, subtotal: 10, gst: 1, other_tax: 0, charges: 0, itc_eligible: true }), /exact tax breakdown/);
  assert.equal((await read(db)).invoices.length, 0);
  await inventory(db, "confirm_purchase", { ...data, lines: [{ ...data.lines[0], stock_excluded: true }] });
  const result = await read(db); assert.equal(result.invoices[0].gst, null); assert.equal(result.invoices[0].tax_confirmed, false);
  assert.equal(result.stock[0].received_packets, 0); assert.equal(result.stock[0].id, item.id);
});

test("pack conversion edits invalidate physical-count drafts before and after a baseline without rewriting historical packets", async (t) => {
  const { db, item } = await fixture(t); await db.exec("SET ROLE service_role");
  const updatePack = (pack_size) => inventory(db, "items", { review_confirmed: true, update_existing: true, items: [{ name: item.name, item_number: item.item_number, source: item.source, pack_size, case_price: 40, packet_price: 4 }] });
  assert.equal(item.balance_version, 0);
  await updatePack(5);
  let stock = (await read(db)).stock[0]; assert.equal(stock.balance_version, 1); assert.equal(stock.on_hand_packets, null);
  await assert.rejects(finance(db, "stock_count", { id: item.id, version: 0, cases: 1, packets: 0, reason: "Draft before conversion changed" }), /changed/);
  await finance(db, "stock_count", { id: item.id, version: 1, cases: 1, packets: 0, reason: "Physical baseline with five per case" });
  await purchase(db, item, { update_prices: false });
  stock = (await read(db)).stock[0]; assert.equal(stock.balance_version, 3); assert.equal(stock.on_hand_packets, 15); assert.equal(stock.received_packets, 10);
  await updatePack(12);
  stock = (await read(db)).stock[0]; assert.equal(stock.balance_version, 4); assert.equal(stock.on_hand_packets, 15); assert.equal(stock.received_packets, 10);
  assert.equal((await read(db)).movements[0].pack_size, 5, "Historical receipt retains its original conversion");
  await assert.rejects(finance(db, "stock_count", { id: item.id, version: 3, cases: 1, packets: 0, reason: "Stale five-packet case draft" }), /changed/);
  await finance(db, "stock_count", { id: item.id, version: 4, cases: 1, packets: 0, reason: "Recounted using twelve per case" });
  stock = (await read(db)).stock[0]; assert.equal(stock.balance_version, 5); assert.equal(stock.on_hand_packets, 12);
  await updatePack(12);
  assert.equal((await read(db)).stock[0].balance_version, 5, "Unchanged conversion does not invalidate a count");
});

test("partial bank allocations, balance correction, reconciliation, replay and audited unmatching", async (t) => {
  const { db, item } = await fixture(t); await purchase(db, item);
  const inv = (await read(db)).invoices[0], account = randomUUID(), statement = randomUUID();
  await finance(db, "bank_account", { id: account, name: "Fixture chequing" });
  const raw = "Date,Description,Amount\n2026-11-03,Gordon Now,-60\n2026-11-04,Sales,100\n";
  await finance(db, "bank_import", { id: statement, account_id: account, name: "Fixture November", from_date: "2026-11-01", to_date: "2026-11-30", opening_balance: null, closing_balance: null,
    balances_confirmed: false, raw_csv: raw, sha256: createHash("sha256").update(raw).digest("hex"), transactions: [
      { line_number: 2, transaction_date: "2026-11-03", description: "Gordon Now", amount: -60 }, { line_number: 3, transaction_date: "2026-11-04", description: "Sales", amount: 100 }] });
  let data = await read(db); const outgoing = data.transactions.find((row) => row.amount < 0), deposit = data.transactions.find((row) => row.amount > 0);
  const match = { id: outgoing.id, transaction_id: outgoing.id, version: 1, allocation_id: randomUUID(), invoice_id: inv.id, amount: 40 };
  const request = randomUUID(); await finance(db, "bank_match", match, manager, request); await finance(db, "bank_match", match, manager, request);
  data = await read(db); assert.equal(data.allocations.length, 1); assert.equal(data.invoices[0].paid, 40); assert.equal(data.invoices[0].outstanding, 65);
  await assert.rejects(finance(db, "bank_match", { ...match, allocation_id: randomUUID(), version: 2, amount: 21 }), /remaining bank amount/);
  await assert.rejects(inventory(db, "void_purchase", { id: inv.purchase_id, reason: "Wrong invoice" }), /Unmatch bank payments/);
  await finance(db, "bank_match", { ...match, allocation_id: randomUUID(), version: 2, amount: 20 });
  await finance(db, "bank_match", { id: deposit.id, transaction_id: deposit.id, version: 1, allocation_id: randomUUID(), category: "sales", amount: 100 });
  data = await read(db); assert.equal(data.invoices[0].outstanding, 45);
  await assert.rejects(finance(db, "bank_finalize", { id: statement, version: data.statements[0].version }), /verified closing balance/);
  await finance(db, "bank_balances", { id: statement, version: data.statements[0].version, opening_balance: 1000, closing_balance: 1040, balances_confirmed: true, reason: "Read actual statement balances" });
  data = await read(db); await finance(db, "bank_finalize", { id: statement, version: data.statements[0].version });
  data = await read(db); assert.equal(data.statements[0].status, "reconciled");
  await assert.rejects(finance(db, "bank_unmatch", { id: match.allocation_id, version: 3, reason: "Wrong invoice" }), /Reopen the statement/);
  await finance(db, "bank_reopen", { id: statement, version: data.statements[0].version, reason: "Correct payment allocation" });
  await finance(db, "bank_unmatch", { id: match.allocation_id, version: 3, reason: "Wrong invoice" });
  data = await read(db); assert.equal(data.invoices[0].paid, 20); assert.equal(data.allocations.filter((row) => row.voided_at).length, 1);
  await assert.rejects(finance(db, "bank_match", { ...match, amount: 41 }, manager, request), /Request key already used/);
});

test("GST requires explicit verified inputs, locks sources after close and records actual filing; all writes stay scoped", async (t) => {
  const { db, item } = await fixture(t);
  await purchase(db, item, { tax_confirmed: false, subtotal: null, gst: null, other_tax: null, charges: null, itc_eligible: null });
  let inv = (await read(db)).invoices[0]; const period = randomUUID();
  const values = { id: period, version: 0, from_date: "2026-11-01", to_date: "2026-11-30", collected: 20, adjustments: 0, purchases_complete: true, sales_complete: true };
  await finance(db, "gst_save", values);
  await assert.rejects(finance(db, "gst_finalize", { id: period, version: 1 }), /Unverified invoice tax/);
  await finance(db, "invoice_tax", { id: inv.id, version: inv.version, subtotal: 100, gst: 5, other_tax: 0, charges: 0, itc_eligible: true });
  await finance(db, "gst_finalize", { id: period, version: 1 });
  let data = await read(db); assert.equal(data.gst_periods[0].input_tax, 5); assert.equal(data.gst_periods[0].net_due, 15);
  inv = data.invoices[0]; await assert.rejects(finance(db, "invoice_tax", { id: inv.id, version: inv.version, subtotal: 100, gst: 5, other_tax: 0, charges: 0, itc_eligible: false }), /Reopen the finalized GST period/);
  await assert.rejects(finance(db, "gst_save", { ...values, version: 0 }, { ...manager, p_actor: IDS.owner, p_location: IDS.b }), /outside this location/);
  await finance(db, "gst_file", { id: period, version: 2, filed_on: "2026-12-01", filing_reference: "TEST-ONLY-REFERENCE" });
  data = await read(db); assert.equal(data.gst_periods[0].status, "filed");
  await finance(db, "gst_reopen", { id: period, version: 3, reason: "Accountant requested correction; original filing remains in audit" });
  data = await read(db); assert.equal(data.gst_periods[0].net_due, null); assert.equal(data.gst_periods[0].filing_reference, null);
  await assert.rejects(read(db, { ...manager, p_actor: IDS.staff }), /Role not permitted/);
  await assert.rejects(finance(db, "bank_account", { id: randomUUID(), name: "Bad" }, { ...manager, p_actor: IDS.corporate }), /Role not permitted/);
  await assert.rejects(read(db, { ...manager, p_session: 9 }), /Personal session required/);
  await db.exec("SET ROLE anon"); await assert.rejects(read(db), /permission denied/); await assert.rejects(db.exec("SELECT * FROM btb_invoices"), /permission denied/);
});
