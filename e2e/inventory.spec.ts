import { test, expect, capture, bun, monthAt, signInBtb } from "./fixtures";

const path = "/between-the-buns/month-end-inventory";

for (const source of [
  { name: "item catalogue", table: "inventory_items" },
  { name: "count sheet", table: "inventory_counts" },
  { name: "opening inventory", table: "inventory_month_snapshots", match: { count_month: `eq.${monthAt(-2)}` } },
  { name: "purchase ledger", table: "inventory_purchases" },
  { name: "saved month status", table: "inventory_month_snapshots", match: { count_month: `eq.${monthAt(-1)}` } },
]) {
  test(`inventory stays uneditable when the ${source.name} fails`, async ({ page, fixture }) => {
    await fixture.configure({ failures: [{ table: source.table, method: "GET", match: source.match }] });
    await signInBtb(page, "manager", path);
    await expect(page.getByRole("heading", { name: "Inventory is unavailable" })).toBeVisible();
    await expect(page.getByLabel("Quantity for Sesame buns")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finalize month", exact: true })).toHaveCount(0);
    await fixture.configure({ failures: [] });
    await page.getByRole("button", { name: "Retry inventory" }).click();
    await expect(page.getByLabel("Quantity for Sesame buns")).toHaveValue("10");
    await expect(page.getByRole("button", { name: "Finalize month", exact: true })).toBeEnabled();
  });
}

test("invalid quantities never save and failed counts, sales and purchases retain their drafts", async ({ page, fixture }) => {
  await signInBtb(page, "manager", path);
  const quantity = page.getByLabel("Quantity for Sesame buns");
  await expect(quantity).toHaveValue("10");
  await quantity.fill("");
  await page.getByRole("button", { name: "Save counts", exact: true }).first().click();
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter a valid quantity");
  expect((await fixture.state()).requests.some((request) => request.path.endsWith("/inventory_counts") && request.method === "DELETE")).toBeFalsy();
  await quantity.fill("12");
  await fixture.configure({ failures: [{ table: "inventory_counts", method: "POST", times: 1 }] });
  await page.getByRole("button", { name: "Save counts", exact: true }).first().click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Couldn’t complete the update");
  await expect(quantity).toHaveValue("12");
  await expect(page.getByText("1 unsaved quantity", { exact: true })).toBeVisible();
  let state = await fixture.state();
  expect(state.tables.inventory_counts.find((row) => row.item_id === bun && row.count_month === monthAt(-1))?.qty).toBe(10);
  await page.getByRole("button", { name: "Save counts", exact: true }).first().click();
  await expect(page.getByText(/counts saved\.$/)).toBeVisible();
  const sales = page.getByLabel("Food sales $");
  await sales.fill("700");
  await fixture.configure({ failures: [{ table: "inventory_month_summary", method: "POST", times: 1 }] });
  await page.getByRole("button", { name: "Save sales", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Couldn’t complete the update");
  await expect(sales).toHaveValue("700");
  await expect(page.getByRole("button", { name: "Save sales", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save sales", exact: true }).click();
  await expect(page.getByText(/food sales saved\.$/)).toBeVisible();
  await page.getByLabel("Purchase type").selectOption("local");
  await page.getByLabel("Purchase date").selectOption(`${monthAt(-1)}-05`);
  await page.getByLabel("Description", { exact: true }).fill("Emergency local stock");
  await page.getByLabel("Amount $", { exact: true }).fill("50");
  await fixture.configure({ failures: [{ table: "inventory_purchases", method: "POST", times: 1 }] });
  await page.getByRole("button", { name: "Add purchase", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Couldn’t complete the update");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Emergency local stock");
  await page.getByRole("button", { name: "Add purchase", exact: true }).click();
  await expect(page.getByText("Purchase saved to the ledger.")).toBeVisible();
  state = await fixture.state();
  expect(state.tables.inventory_counts.find((row) => row.item_id === bun && row.count_month === monthAt(-1))?.qty).toBe(12);
  expect(state.tables.inventory_month_summary.find((row) => row.count_month === monthAt(-1))?.sales).toBe(700);
  expect(state.tables.inventory_purchases.filter((row) => row.count_month === monthAt(-1)).reduce((sum, row) => sum + Number(row.amount), 0)).toBe(150);
  await page.reload();
  await expect(quantity).toHaveValue("12");
  await expect(sales).toHaveValue("700");
  await expect(page.getByText("Emergency local stock", { exact: true })).toBeVisible();
});

test("finalizing requires saved entries and confirmed audit writes; reopening preserves the reason on failure", async ({ page, fixture }, info) => {
  await signInBtb(page, "manager", path);
  const quantity = page.getByLabel("Quantity for Sesame buns");
  const finalize = page.getByRole("button", { name: "Finalize month", exact: true });
  await expect(quantity).toHaveValue("10");
  await quantity.fill("12");
  await expect(finalize).toBeDisabled();
  await page.getByRole("button", { name: "Save counts", exact: true }).first().click();
  await expect(page.getByText(/counts saved\.$/)).toBeVisible();
  await page.getByLabel("Food sales $").fill("600");
  await expect(finalize).toBeDisabled();
  await page.getByRole("button", { name: "Save sales", exact: true }).click();
  await expect(finalize).toBeEnabled();
  await page.getByLabel("Description", { exact: true }).fill("Unfinished invoice");
  await expect(finalize).toBeDisabled();
  await page.getByRole("button", { name: "Clear purchase", exact: true }).click();
  await fixture.configure({ failures: [{ table: "inventory_audit_log", method: "POST", times: 1 }] });
  await finalize.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/audit/i);
  await expect(quantity).toBeEditable();
  expect((await fixture.state()).tables.inventory_month_snapshots.find((row) => row.count_month === monthAt(-1))).toBeUndefined();
  await finalize.click();
  await expect(page.getByText(/finalized\. The saved close/)).toBeVisible();
  await expect(quantity).not.toBeEditable();
  await expect(finalize).toHaveCount(0);
  let state = await fixture.state();
  expect(state.tables.inventory_month_snapshots.find((row) => row.count_month === monthAt(-1))).toMatchObject({ status: "finalized", opening_value: 70, closing_value: 50, purchases: 100, sales: 600, cogs: 120, food_cost_pct: 20, version: 1 });
  const lockedWrite = await page.request.post("/api/btb/inventory-counts", { data: { count_month: monthAt(-1), counts: [{ item_id: bun, qty: 99 }] } });
  expect(lockedWrite.status()).toBe(409);
  await capture(page, info, "inventory-finalized");
  const reopen = page.getByRole("button", { name: "Reopen month", exact: true });
  await expect(reopen).toBeDisabled();
  await page.getByLabel("Reason for reopening").fill("Correct the closing bun count");
  await fixture.configure({ failures: [{ table: "inventory_audit_log", method: "POST", times: 1 }] });
  await reopen.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/audit/i);
  await expect(page.getByLabel("Reason for reopening")).toHaveValue("Correct the closing bun count");
  expect((await fixture.state()).tables.inventory_month_snapshots.find((row) => row.count_month === monthAt(-1))?.status).toBe("finalized");
  await reopen.click();
  await expect(page.getByText("Reopened draft", { exact: true })).toBeVisible();
  await expect(quantity).toBeEditable();
  state = await fixture.state();
  expect(state.tables.inventory_month_snapshots.find((row) => row.count_month === monthAt(-1))).toMatchObject({ status: "draft", reopen_reason: "Correct the closing bun count" });
  expect(state.tables.inventory_audit_log.filter((row) => row.count_month === monthAt(-1)).map((row) => row.action)).toEqual(["finalize", "reopen"]);
});

test("late month responses cannot replace the new month and switching warns about unsaved entries", async ({ page }) => {
  await signInBtb(page, "manager");
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  await page.route("**/api/btb/inventory-counts?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("month") !== monthAt(-1)) return route.continue();
    const response = await route.fetch();
    held.resolve();
    await release.promise;
    await route.fulfill({ response }).catch(() => { /* The old month intentionally aborted its request. */ });
    completed.resolve();
  });
  await page.goto(path);
  await held.promise;
  await page.getByLabel("Closing month").selectOption(monthAt(0));
  const quantity = page.getByLabel("Quantity for Sesame buns");
  await expect(quantity).toHaveValue("4");
  release.resolve();
  await completed.promise;
  await expect(quantity).toHaveValue("4");
  await quantity.fill("8");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Closing month").selectOption(monthAt(-1));
  await expect(page.getByLabel("Closing month")).toHaveValue(monthAt(0));
  await expect(quantity).toHaveValue("8");
  await page.unroute("**/api/btb/inventory-counts?*");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Closing month").selectOption(monthAt(-1));
  await expect(quantity).toHaveValue("10");
});

for (const role of ["staff", "corporate"] as const) {
  test(`${role} can review inventory but cannot change counts`, async ({ page }) => {
    await signInBtb(page, role, path);
    await expect(page.getByLabel("Quantity for Sesame buns")).toHaveValue("10");
    await expect(page.getByLabel("Quantity for Sesame buns")).not.toBeEditable();
    await expect(page.getByRole("button", { name: "Save counts", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finalize month", exact: true })).toHaveCount(0);
    const response = await page.request.post("/api/btb/inventory-counts", { data: { count_month: monthAt(-1), counts: [{ item_id: bun, qty: 12 }] } });
    expect(response.status()).toBe(403);
  });
}

test("inventory remains usable on a narrow screen with a contained count sheet", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInBtb(page, "manager", path);
  await expect(page.getByLabel("Quantity for Sesame buns")).toHaveValue("10");
  await capture(page, info, "mobile-inventory");
  const sheet = page.getByRole("region", { name: "Inventory count sheet" });
  expect(await sheet.evaluate((element) => element.scrollWidth > element.clientWidth)).toBeTruthy();
  await page.setViewportSize({ width: 812, height: 375 });
  await capture(page, info, "landscape-inventory");
});
