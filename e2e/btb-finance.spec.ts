import { randomUUID } from "node:crypto";
import { test, expect, capture, east, signInEmployee } from "./fixtures";
import { apiSignIn, appOrigin, createEmployee } from "./btb-helpers";

const itemId = "30000000-0000-4000-8000-000000000001";
const pdf = Buffer.from("%PDF-1.4\nBTB finance invoice fixture");
const reginaDate = (offset = 0) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Regina", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(Date.now() + offset * 86_400_000));
const today = reginaDate();
const month = today.slice(0, 7);
const [year, monthNumber] = month.split("-").map(Number);
const periodStart = `${month}-01`;
const periodEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
const dueDate = reginaDate(30);

async function personalAccounts(request: Parameters<typeof apiSignIn>[0]) {
  await apiSignIn(request);
  const manager = await createEmployee(request, { name: "Robin Finance", email: "robin.finance@team.test", role: "manager", position: "Manager" });
  const staff = await createEmployee(request, { name: "Sam Counter", email: "sam.counter@team.test", role: "staff", position: "Front counter" });
  return { manager, staff };
}

async function seedFinanceLocation(fixture: { configure: (options: object) => Promise<void> }, people: Awaited<ReturnType<typeof personalAccounts>>) {
  await fixture.configure({ tables: {
    locations: [{ id: east, name: "BTB Finance" }],
    btb_location_settings: [{ location_id: east, timezone: "America/Regina", active: true, settings_confirmed: true, version: 1 }],
    btb_superadmin_locations: [{ location_id: east }],
    btb_location_page_access: [{ location_id: east, page: "platform", allowed: true }],
    btb_location_access: [
      { location_id: east, employee_id: people.manager.id },
      { location_id: east, employee_id: people.staff.id },
    ],
    platform_inventory_items: [{
      id: itemId, location_id: east, name: "Frozen buns", item_number: "9001", source: "gfs",
      unit: "case", unit_size: "case", pack_size: 6, category: "Bakery", unit_cost: 30,
      case_price: 30, packet_price: 5, par_value: 12, position: 1,
    }],
  } });
}

async function stageInvoice(request: Parameters<typeof apiSignIn>[0], managerEmail: string) {
  await apiSignIn(request, managerEmail);
  const fileResponse = await request.post("/api/btb/platform/file", { headers: { Origin: appOrigin }, data: {
    location_id: east, purpose: "purchase", name: "gfs-invoice.pdf", mime: "application/pdf",
    content_base64: pdf.toString("base64"),
  } });
  await expect(fileResponse).toBeOK();
  const file = (await fileResponse.json()).file;
  const importResponse = await request.post("/api/btb/platform/import", { headers: { Origin: appOrigin }, data: {
    location_id: east, month, kind: "gfs", file_id: file.id, text: "GFS invoice 9001",
    extractor: "test fixture", extracted: {
      vendor: "GFS", reference: "INV-9001", date: today, due_date: dueDate, total: 35,
      lines: [{ description: "Frozen buns", item_code: "9001", cases: 1, packets: 2, unit_price: 30, price_basis: "case", line_total: 35 }],
    },
  } });
  await expect(importResponse).toBeOK();
  return { file, invoice: (await importResponse.json()).import };
}

test("finance approves an invoice, baselines stock, verifies GST and reconciles a mapped bank CSV", async ({ page, request, fixture }, info) => {
  const people = await personalAccounts(request);
  await seedFinanceLocation(fixture, people);
  await stageInvoice(request, people.manager.email!);

  await signInEmployee(page, people.manager.email!, "/btb/demo/platform");
  await page.getByRole("button", { name: "Inventory & food cost", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Document review queue/ })).toBeVisible();
  await page.getByRole("button", { name: "Review & edit", exact: true }).click();
  await expect(page.getByLabel("Supplier", { exact: true })).toHaveValue("GFS");
  await expect(page.getByLabel("Invoice / receipt number")).toHaveValue("INV-9001");
  await expect(page.getByLabel("Purchase date")).toHaveValue(today);
  await expect(page.getByLabel("Confirmed total (CAD)")).toHaveValue("35");
  await page.getByLabel("I checked these values against the original GFS invoice.").check();
  await page.getByRole("button", { name: "Confirm reviewed purchase" }).click();
  await expect(page.getByText("No documents are waiting for review this month.")).toBeVisible();

  await page.getByRole("button", { name: "Finance & stock", exact: true }).click();
  const finance = page.getByRole("region", { name: "Finance and stock" });
  await expect(finance.getByRole("heading", { name: "Finance & stock" })).toBeVisible();
  const register = finance.getByRole("table", { name: "Approved source invoices · amounts in CAD" });
  await expect(register).toContainText("GFS");
  await expect(register).toContainText("INV-9001");
  await expect(register).toContainText("$35.00");
  await expect(register).toContainText("Tax unverified");

  await finance.getByRole("button", { name: "Verify GST" }).click();
  const tax = page.getByRole("dialog", { name: "Verify invoice GST" });
  await tax.getByLabel("Subtotal (CAD)").fill("33.38");
  await tax.getByLabel("GST (CAD)").fill("1.62");
  await tax.getByLabel("Other tax (CAD)").fill("0");
  await tax.getByLabel("Additional charges (CAD)").fill("0");
  await tax.getByLabel("Input-tax-credit eligibility").selectOption("yes");
  await tax.getByLabel("I checked the source tax breakdown and GST eligibility with the appropriate records / accountant.").check();
  await tax.getByRole("button", { name: "Save verified GST" }).click();
  await expect(finance.getByRole("status").filter({ hasText: "GST verified" })).toBeVisible();
  await expect(register).toContainText("GST $1.62 · ITC eligible");

  await finance.getByRole("tab", { name: "Stock & prices" }).click();
  const stock = finance.getByRole("table", { name: "Stock in catalogue packets / eaches" });
  await expect(stock).toContainText("Unknown — count first");
  await expect(stock).toContainText("8 packets");
  await expect(stock).toContainText("$30.00 / case");

  await fixture.configure({ failures: [{ table: "btb_platform_finance", method: "POST", times: 1, afterCommit: true }] });
  await stock.getByRole("row", { name: /Frozen buns/ }).getByRole("button", { name: "Count stock" }).click();
  const count = page.getByRole("dialog", { name: "Count physical stock" });
  await count.getByLabel("Cases counted").fill("2");
  await count.getByLabel("Packets counted").fill("3");
  await count.getByLabel("Count source / reason").fill("Physical count at close");
  await count.getByRole("button", { name: "Save physical count" }).click();
  await expect(count.getByRole("alert")).toBeVisible();
  await count.getByRole("button", { name: "Save physical count" }).click();
  await expect(page.getByRole("dialog", { name: "Count physical stock" })).not.toBeVisible();
  await expect(stock).toContainText("15 packets");
  await expect(stock).toContainText("2.5000 case equivalent");

  await stock.getByRole("row", { name: /Frozen buns/ }).getByRole("button", { name: "Adjust stock" }).click();
  const adjust = page.getByRole("dialog", { name: "Adjust stock" });
  await adjust.getByLabel("Cases change").fill("-1");
  await adjust.getByLabel("Packets change").fill("0");
  await adjust.getByLabel("Adjustment reason / evidence").fill("Freezer discard");
  await adjust.getByRole("button", { name: "Save stock adjustment" }).click();
  await expect(stock).toContainText("9 packets");
  await expect(finance.getByRole("table", { name: "Receipt, reversal and adjustment history" })).toContainText("Freezer discard");
  await expect(finance.getByRole("table", { name: "Reviewed supplier price history" })).toContainText("GFS");

  await finance.getByRole("tab", { name: "GST" }).click();
  await finance.getByRole("button", { name: "New GST period" }).click();
  const gst = page.getByRole("dialog", { name: "New GST period" });
  await gst.getByLabel("Period start").fill(periodStart);
  await gst.getByLabel("Period end").fill(periodEnd);
  await gst.getByLabel("Collected GST (CAD)").fill("10.00");
  await gst.getByLabel("Adjustments (CAD, signed)").fill("0");
  await gst.getByLabel(/All purchase invoices and receipts/).check();
  await gst.getByLabel(/All sales and collected GST/).check();
  await gst.getByRole("button", { name: "Save GST draft" }).click();
  const gstPeriod = finance.getByRole("article", { name: `GST ${periodStart} to ${periodEnd}` });
  await expect(gstPeriod).toContainText("Draft estimate");
  await expect(gstPeriod).toContainText("$8.38");
  await gstPeriod.getByRole("button", { name: "Finalize reviewed GST" }).click();
  const finalize = page.getByRole("dialog", { name: "Finalize GST record" });
  await finalize.getByLabel(/I reviewed purchase evidence/).check();
  await finalize.getByRole("button", { name: "Confirm GST finalization" }).click();
  await expect(gstPeriod).toContainText("Finalized");
  await gstPeriod.getByRole("button", { name: "Record actual filing" }).click();
  const filing = page.getByRole("dialog", { name: "Record actual GST filing" });
  await filing.getByLabel("Actual filing date").fill(today);
  await filing.getByLabel("Filing confirmation reference").fill("CRA-ACK-42");
  await filing.getByRole("button", { name: "Save actual filing record" }).click();
  await expect(gstPeriod).toContainText("Filed");

  await finance.getByRole("tab", { name: "Bank reconciliation" }).click();
  await finance.getByRole("button", { name: "Add bank account" }).click();
  const account = page.getByRole("dialog", { name: "Add bank account" });
  await account.getByLabel("Account display name").fill("Operating account");
  await account.getByRole("button", { name: "Save bank account" }).click();
  await expect(finance.getByText("Operating account")).toBeVisible();

  await finance.getByRole("button", { name: "Import bank CSV" }).click();
  const importer = page.getByRole("dialog", { name: "Import bank CSV" });
  await importer.getByLabel("Bank account").selectOption({ label: "Operating account" });
  await importer.getByLabel("Source CSV (up to 3 MB, header + 1–5,000 rows)").setInputFiles({
    name: "november.csv", mimeType: "text/csv",
    buffer: Buffer.from(`Date,Description,Amount\n${today},GFS PAYMENT,-35.00\n`),
  });
  await importer.getByLabel("Transaction date column").selectOption("0");
  await importer.getByLabel("Description column").selectOption("1");
  await importer.getByLabel("Date format").selectOption("iso");
  await importer.getByLabel("Signed amount column").selectOption("2");
  await importer.getByLabel("Statement display name").fill("November statement");
  await importer.getByLabel("Statement start").fill(periodStart);
  await importer.getByLabel("Statement end").fill(periodEnd);
  await importer.getByLabel("Actual opening balance (CAD, optional)").fill("100.00");
  await importer.getByLabel("Actual closing balance (CAD, optional)").fill("65.00");
  await importer.getByLabel(/I verified both balances against the actual bank statement/).check();
  await expect(importer).toContainText("1 previewed transactions");
  await importer.getByLabel(/I checked the full preview, signs, date format/).check();
  await importer.getByRole("button", { name: "Import reviewed statement" }).click();
  await expect(finance.getByText("Draft — review required")).toBeVisible();
  await expect(finance.getByText("1 of 1 transactions still need allocation")).toBeVisible();

  await finance.getByRole("button", { name: "Review allocation" }).click();
  const allocation = page.getByRole("dialog", { name: "Review bank allocation" });
  await allocation.getByRole("button", { name: /Use suggestion: GFS/ }).click();
  await allocation.getByLabel(/I verified this amount and its invoice or category/).check();
  await allocation.getByRole("button", { name: "Confirm bank allocation" }).click();
  await expect(finance.getByText("Allocated", { exact: true })).toBeVisible();
  await finance.getByRole("button", { name: "Reconcile statement" }).click();
  const reconcile = page.getByRole("dialog", { name: "Reconcile reviewed statement" });
  await reconcile.getByLabel(/I reviewed every allocation and the actual opening and closing balances/).check();
  await reconcile.getByRole("button", { name: "Confirm reconciliation" }).click();
  await expect(finance.getByText("Reconciled", { exact: true })).toBeVisible();
  await capture(page, info, "btb-finance-reconciled");

  const state = await fixture.state();
  expect(state.tables.btb_invoices).toHaveLength(1);
  expect(state.tables.btb_invoices[0]).toMatchObject({ vendor: "GFS", reference: "INV-9001", tax_confirmed: true, itc_eligible: true });
  expect(state.tables.btb_stock_balances.find((row) => row.item_id === itemId)).toMatchObject({ opening_packets: 15 });
  const adjustment = state.tables.btb_stock_movements.find((row) => row.kind === "adjustment");
  expect(Number(adjustment?.packet_delta)).toBe(-6);
  expect(adjustment?.reason).toBe("Freezer discard");
  expect(state.tables.btb_gst_periods[0]).toMatchObject({ status: "filed", filing_reference: "CRA-ACK-42" });
  expect(state.tables.btb_bank_statements[0]).toMatchObject({ status: "reconciled" });
  expect(state.tables.btb_bank_allocations[0].invoice_id).toBe(state.tables.btb_invoices[0].id);
});

test("staff cannot open finance or write a finance command", async ({ page, request, fixture }) => {
  const people = await personalAccounts(request);
  await seedFinanceLocation(fixture, people);
  await signInEmployee(page, people.staff.email!, "/btb/demo/platform");
  await expect(page.getByRole("button", { name: "Daily operations", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finance & stock", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inventory & food cost", exact: true })).toHaveCount(0);
  await apiSignIn(request, people.staff.email!);
  const response = await request.post("/api/btb/platform/finance", { headers: { Origin: appOrigin }, data: {
    location_id: east, request_id: randomUUID(), action: "bank_account", data: { id: randomUUID(), name: "Forbidden account" },
  } });
  expect(response.status()).toBe(403);
});
