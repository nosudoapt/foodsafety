import { test, expect, capture, signInBtb } from "./fixtures";
import { apiSignIn } from "./btb-helpers";
import { FRANCHISE_SECTIONS, FRANCHISE_TASKS } from "../src/lib/btb-franchise";
import { LOYALTY_CHANNELS, LOYALTY_EXCLUDED_CHANNELS, LOYALTY_POINTS, LOYALTY_REDEMPTION, LOYALTY_REWARDS, LOYALTY_WORKAROUND } from "../src/lib/btb-loyalty";

test("the corporate opening checklist preserves all sixteen sections and imported tasks, with retryable and versioned progress", async ({ page, request, fixture }, info) => {
  const endpoint = "/api/btb/franchise-checklist";
  await fixture.configure({ tables: { btb_franchise_tasks: [{ task_key: "legacy-launch-task", phase: "Legacy launch phase", task: "Confirm the original opening-day delivery", custom: true }] } });
  await signInBtb(page, "corporate");
  const card = page.locator('#btb-tools a[href="/between-the-buns/new-restaurant"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Franchise Opening Checklist");
  await card.click();
  await expect(page.getByRole("heading", { name: "Franchise opening checklist", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Additional saved launch tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await expect(page.locator("button.franchise-section__heading")).toHaveCount(16);
  await expect(page.getByRole("checkbox")).toHaveCount(FRANCHISE_TASKS.length + 1);
  for (const section of FRANCHISE_SECTIONS) {
    const region = page.locator(".franchise-section").filter({ has: page.getByRole("heading", { name: section.title, exact: true }) });
    for (const task of section.groups.flatMap((group) => group.tasks)) await expect(region.getByRole("checkbox", { name: task, exact: true })).toBeVisible();
  }
  const first = page.getByRole("checkbox", { name: /^Franchise Agreement signed/ });
  await fixture.configure({ failures: [{ table: "btb_franchise_tasks", method: "POST", times: 1 }] });
  await first.check();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be saved");
  await expect(first).toBeChecked();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
  expect((await fixture.state()).tables.btb_franchise_tasks).toHaveLength(1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Launch progress saved.");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
  expect((await fixture.state()).tables.btb_franchise_tasks.find((task) => task.task_key === FRANCHISE_TASKS[0].key)).toMatchObject({ done: true, done_by_name: "Corporate (shared workspace)", version: 1 });
  await page.reload();
  await expect(first).toBeChecked();

  await apiSignIn(request, "corporate@btb.demo");
  await expect(await request.post(endpoint, { data: { task_key: FRANCHISE_TASKS[0].key, version: 1, done: false } })).toBeOK();
  await first.uncheck();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("task changed");
  await page.getByRole("button", { name: "Reload latest progress" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
  await expect(first).not.toBeChecked();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Launch progress saved.");
  expect((await fixture.state()).tables.btb_franchise_tasks.find((task) => task.task_key === FRANCHISE_TASKS[0].key)).toMatchObject({ done: false, version: 3 });
  expect((await request.delete(endpoint, { data: { task_key: FRANCHISE_TASKS[0].key, version: 3 } })).status()).toBe(409);

  await page.getByRole("button", { name: "Add a task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a launch task" });
  await dialog.getByRole("combobox", { name: "Section", exact: true }).selectOption("Grand Opening Day");
  await dialog.getByRole("textbox", { name: "Task", exact: true }).fill("Confirm neighbourhood opening invitations");
  await dialog.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Confirm neighbourhood opening invitations", exact: true })).toBeVisible();
  const remove = page.getByRole("button", { name: "Remove additional task: Confirm neighbourhood opening invitations", exact: true });
  await fixture.configure({ failures: [{ table: "btb_franchise_tasks", method: "DELETE", times: 1 }] });
  await remove.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be removed");
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Confirm the original opening-day delivery", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search franchise tasks" }).fill("Food Safety Course- Staff");
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "Food Safety Course- Staff", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search franchise tasks" }).clear();
  await page.getByRole("button", { name: "Collapse all", exact: true }).click();
  await capture(page, info, "franchise-opening-desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: /Franchise & Corporate Setup/ }).click();
  await capture(page, info, "franchise-opening-mobile");

  for (const role of ["staff", "supervisor", "manager", "admin"]) {
    await apiSignIn(request, `${role}@btb.demo`);
    expect((await request.get(endpoint)).status(), role).toBe(403);
    expect((await request.post(endpoint, { data: { task_key: FRANCHISE_TASKS[0].key, version: 3, done: true } })).status(), role).toBe(403);
  }
});

test("the loyalty card contains the complete employee and customer guides with keyboard-accessible tabs", async ({ page }, info) => {
  await signInBtb(page, "staff");
  const card = page.locator('#btb-tools a[href="/between-the-buns/loyalty-rewards"]');
  await expect(card).toHaveCount(1);
  await card.click();
  const employee = page.getByRole("tabpanel", { name: "Employee guide" });
  await expect(employee).toBeVisible();
  await expect(employee.locator(".loyalty-sequence strong")).toHaveText(["ASK", "SCAN", "VIEW OFFERS", "ENTER ORDER", "PAY LAST"]);
  for (const reward of LOYALTY_REWARDS) {
    const region = employee.locator(".loyalty-reward").filter({ hasText: reward.title });
    await expect(region).toContainText(reward.reward);
    await expect(region).toContainText(reward.details);
  }
  const redemption = employee.locator(".loyalty-block").filter({ has: page.getByRole("heading", { name: "Redeem a reward", exact: true }) });
  await expect(redemption.getByRole("listitem")).toHaveText(LOYALTY_REDEMPTION.map((step, index) => `${index + 1}${step}`));
  const points = employee.locator(".loyalty-block").filter({ has: page.getByRole("heading", { name: "Redeem points", exact: true }) });
  await expect(points.getByRole("listitem")).toHaveText(LOYALTY_POINTS.map((step, index) => `${index + 1}${step}`));
  await expect(employee).toContainText(LOYALTY_WORKAROUND.rule);
  for (const step of LOYALTY_WORKAROUND.steps) await expect(employee).toContainText(step);
  await expect(employee).toContainText(LOYALTY_WORKAROUND.limit);
  await expect(employee.getByRole("link", { name: "Kamal: 306-314-9468" })).toHaveAttribute("href", "tel:+13063149468");
  await expect(employee).toContainText("points and rewards should post automatically");
  for (const channel of [...LOYALTY_CHANNELS, ...LOYALTY_EXCLUDED_CHANNELS]) await expect(employee).toContainText(channel);
  await capture(page, info, "loyalty-employee-desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "loyalty-employee-mobile");
  const employeeTab = page.getByRole("tab", { name: "Employee guide", exact: true });
  await employeeTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Customer guide", exact: true })).toBeFocused();
  const customer = page.getByRole("tabpanel", { name: "Customer guide" });
  await expect(customer).toBeVisible();
  await expect(employee).toHaveCount(0);
  for (const text of ["Complete your loyalty profile", "Wait up to 24 hours for activation", "Show your digital barcode first", "Questions? Ask a team member.", "Only visible, valid and eligible rewards can be redeemed", "points and rewards automatically"]) await expect(customer).toContainText(text);
  for (const reward of LOYALTY_REWARDS) await expect(customer).toContainText(reward.details);
  for (const channel of [...LOYALTY_CHANNELS, ...LOYALTY_EXCLUDED_CHANNELS]) await expect(customer).toContainText(channel);
  await capture(page, info, "loyalty-customer-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, info, "loyalty-customer-desktop");
  await page.keyboard.press("Home");
  await expect(employeeTab).toBeFocused();
  await expect(employee).toBeVisible();
});

for (const role of ["supervisor", "manager"] as const) {
  test(`${role} has one loyalty card with access to both guides`, async ({ page }) => {
    await signInBtb(page, role);
    const card = page.locator('#btb-tools a[href="/between-the-buns/loyalty-rewards"]');
    await expect(card).toHaveCount(1);
    await card.click();
    await expect(page.getByRole("tabpanel", { name: "Employee guide" })).toBeVisible();
    await page.getByRole("tab", { name: "Customer guide", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "Customer guide" })).toBeVisible();
  });
}
