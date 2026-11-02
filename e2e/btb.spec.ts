import { test, expect, capture, signInBtb, type BtbRole } from "./fixtures";
import { btbToday } from "../src/lib/btb-team";
import { btbDateWindow } from "../src/lib/btb-dashboard";

const views: { role: BtbRole; title: string; metric: string; available: string; restricted: string }[] = [
  { role: "staff", title: "Ready for a good shift.", metric: "Prep lines recorded: 2", available: "prep-list", restricted: "vault" },
  { role: "supervisor", title: "A smoother shift starts here.", metric: "Orders saved today: 1", available: "compliance", restricted: "vault" },
  { role: "manager", title: "Your restaurant, in focus.", metric: "Last month’s inventory: Draft", available: "month-end-inventory", restricted: "franchise-inspection" },
  { role: "corporate", title: "The bigger picture, made clear.", metric: "Franchise inspections: 1", available: "franchise-inspection", restricted: "admin" },
  { role: "admin", title: "The right tools. The right people.", metric: "Managed roles: 4", available: "admin", restricted: "prep-list" },
];

for (const view of views) {
  test(`BTB ${view.role} has a distinct overview and enforced direct-page access`, async ({ page, fixture }, info) => {
    const day = btbToday();
    if (view.role === "manager") await fixture.configure({ tables: { inventory_month_snapshots: [{ count_month: btbDateWindow(day)!.inventoryMonth, status: "draft" }] } });
    await signInBtb(page, view.role);
    await expect(page.getByRole("heading", { name: view.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: view.metric, exact: true })).toBeVisible();
    await expect(page.locator(".dash__eyebrow time")).toHaveAttribute("datetime", day);
    const tools = page.locator("#btb-tools");
    await expect(tools.locator(`a[href="/between-the-buns/${view.available}"]`)).toHaveCount(1);
    await expect(tools.locator(`a[href="/between-the-buns/${view.restricted}"]`)).toHaveCount(0);
    await capture(page, info, `btb-${view.role}-dashboard`);
    await page.goto(`/between-the-buns/${view.restricted}`);
    await expect(page.getByRole("heading", { name: "This page isn’t in your workspace." })).toBeVisible();
  });
}

test("saved restrictions apply to search, metrics and direct reference pages", async ({ page, fixture }) => {
  await fixture.configure({ tables: { role_page_access: [
    { role: "supervisor", page: "compliance", allowed: false },
    { role: "supervisor", page: "prep-manual", allowed: false },
  ] } });
  await signInBtb(page, "supervisor");
  await expect(page.getByRole("button", { name: "Refresh overview" })).toBeEnabled();
  await expect(page.getByRole("link", { name: /^Compliance renewals:/ })).toHaveCount(0);
  const search = page.getByRole("searchbox", { name: "Search BTB tools" });
  await search.fill("prep manual");
  await expect(page.getByRole("heading", { name: /No tools match/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator('#btb-tools a[href="/between-the-buns/checklists"]')).toHaveCount(1);
  const state = await fixture.state();
  expect(state.requests.some((request) => request.path.endsWith("/compliance_documents"))).toBeFalsy();
  await page.goto("/between-the-buns/prep-manual");
  await expect(page.getByRole("heading", { name: "This page isn’t in your workspace." })).toBeVisible();
});

test("permission-load failures block tools and offer a working retry", async ({ page, fixture }) => {
  await fixture.configure({ failures: [{ table: "role_page_access", method: "GET" }] });
  await signInBtb(page, "manager", "/between-the-buns/month-end-inventory");
  await expect(page.getByRole("heading", { name: "Let’s reconnect your workspace." })).toBeVisible();
  await expect(page.getByLabel("Closing month")).toHaveCount(0);
  await fixture.configure({ failures: [] });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Quantity for Sesame buns")).toHaveValue("10");
});

test("admin keeps failed permission edits and saves all roles in one atomic request", async ({ page, fixture }, info) => {
  await signInBtb(page, "admin", "/between-the-buns/admin");
  await expect(page.getByRole("heading", { name: "Role & page access" })).toBeVisible();
  const staffPrep = page.getByRole("checkbox", { name: "Daily Prep Sheet available to Staff", exact: true });
  await expect(staffPrep).toBeChecked();
  await staffPrep.uncheck();
  await page.getByRole("button", { name: /^Manager \d+ pages available$/ }).click();
  const managerPrep = page.getByRole("checkbox", { name: "Daily Prep Sheet available to Manager", exact: true });
  await managerPrep.uncheck();
  await expect(page.getByText("2 unsaved changes", { exact: true })).toBeVisible();
  await fixture.configure({ failures: [{ table: "role_page_access", method: "POST", times: 1 }] });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Changes weren’t saved");
  await expect(managerPrep).not.toBeChecked();
  await expect(page.getByText("All changes saved", { exact: true })).toHaveCount(0);
  expect((await fixture.state()).tables.role_page_access).toEqual([]);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  const state = await fixture.state();
  expect(state.tables.role_page_access.map(({ role, page: path, allowed }) => ({ role, page: path, allowed }))).toEqual([
    { role: "staff", page: "prep-list", allowed: false }, { role: "manager", page: "prep-list", allowed: false },
  ]);
  const writes = state.requests.filter((request) => request.path.endsWith("/role_page_access") && request.method === "POST");
  expect(writes).toHaveLength(2); // One failed attempt and one successful bulk upsert.
  expect(writes.every((request) => Array.isArray(request.body) && request.body.length === 2)).toBeTruthy();
  await capture(page, info, "btb-access-editor");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Daily Prep Sheet available to Staff", exact: true })).not.toBeChecked();
});
