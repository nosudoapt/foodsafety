import { test, expect, capture, east, west, signInFoodSafe, type FoodSafeRole } from "./fixtures";

const views: { role: FoodSafeRole; title: string; figures: string[]; tool: string; absent?: string }[] = [
  { role: "staff", title: "A good shift starts here.", figures: ["Your checks today: 1", "Flagged temperatures: 1", "Your cleaning today: 1"], tool: "/checks", absent: "/admin/vault" },
  { role: "manager", title: "Your day, under control.", figures: ["Your checks today: 1", "Flagged temperatures: 2", "Open actions: 1"], tool: "/admin/compliance", absent: "/admin/vault" },
  { role: "owner", title: "Your business, at a glance.", figures: ["Compliance renewals: 1", "Business documents: 2", "Staff licence renewals: 1"], tool: "/admin/vault" },
  { role: "multi_location_owner", title: "Every location. One clear view.", figures: ["Connected locations: 2", "Flagged temperatures: 3", "Open actions: 2"], tool: "/admin/new-restaurant" },
  { role: "corporate", title: "A clearer picture of the group.", figures: ["Connected locations: 2", "Compliance renewals: 2", "Inspections this month: 1"], tool: "/admin/inspections/corporate" },
  { role: "designer", title: "Good work, ready to go live.", figures: ["Active promotions: 1", "Planned promotions: 1", "Scheduled posts: 1", "Promotions with artwork: 1"], tool: "/admin/marketing", absent: "/checks" },
];

for (const view of views) {
  test(`${view.role} sees its own dashboard, figures and tools`, async ({ page }, info) => {
    await signInFoodSafe(page, view.role);
    await expect(page.getByRole("heading", { name: view.title, exact: true })).toBeVisible();
    for (const figure of view.figures) await expect(page.getByRole("link", { name: figure, exact: true })).toBeVisible();
    const directory = page.locator("#workspace-tools");
    await expect(directory.locator(`a[href="${view.tool}"]`)).toHaveCount(1);
    if (view.absent) await expect(directory.locator(`a[href="${view.absent}"]`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh dashboard" })).toBeEnabled();
    await capture(page, info, `${view.role}-dashboard`);
  });
}

test("group comparison drills into site ids and preserves restaurant register scope", async ({ page, fixture }) => {
  await signInFoodSafe(page, "multi_location_owner");
  await expect(page.getByRole("link", { name: "Flagged temperatures: 3", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Market Street", exact: true }).click();
  await expect(page.getByRole("button", { name: "One location", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Dashboard location")).toHaveValue(west);
  await expect(page.getByRole("link", { name: "Flagged temperatures: 1", exact: true })).toBeVisible();
  await expect(page.locator("#dashboard-heading")).toBeFocused();
  await page.getByLabel("Dashboard location").selectOption(east);
  await expect(page.getByRole("link", { name: "Flagged temperatures: 2", exact: true })).toBeVisible();
  const state = await fixture.state();
  const licences = state.requests.filter((request) => request.path.endsWith("/staff_licenses") && request.method === "HEAD");
  expect(licences.length).toBeGreaterThan(0);
  expect(licences.every((request) => request.query.restaurant_name === "eq.The Test Kitchen")).toBeTruthy();
});

test("failed locations and failed counts show unavailable data and recover on retry", async ({ page, fixture }) => {
  await fixture.configure({ failures: [{ table: "locations", method: "GET" }] });
  await signInFoodSafe(page, "owner");
  await expect(page.getByRole("link", { name: "Compliance renewals: unavailable", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Business documents: 2", exact: true })).toBeVisible();
  await expect(page.getByText("Your briefing is incomplete")).toHaveCount(0); // Known licence issues still deserve attention.
  let state = await fixture.state();
  expect(state.requests.some((request) => request.path.endsWith("/corrective_actions"))).toBeFalsy();
  await fixture.configure({ failures: [{ table: "corrective_actions", method: "HEAD" }] });
  await page.getByRole("button", { name: "Retry locations" }).click();
  await expect(page.getByRole("link", { name: "Compliance renewals: 1", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open actions: unavailable", exact: true })).toBeVisible();
  await fixture.configure({ failures: [] });
  await page.getByRole("button", { name: "Refresh dashboard" }).click();
  await expect(page.getByRole("link", { name: "Open actions: 1", exact: true })).toBeVisible();
  state = await fixture.state();
  expect(state.requests.filter((request) => request.path.endsWith("/corrective_actions")).every((request) => request.query.location_id === `in.(${east})`)).toBeTruthy();
});

test("keyboard page search opens tools and staff cannot directly enter the vault", async ({ page }) => {
  await signInFoodSafe(page, "staff");
  await expect(page.getByRole("button", { name: "Refresh dashboard" })).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search pages", exact: true });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole("combobox");
  await expect(search).toBeFocused();
  await search.fill("vault");
  await expect(dialog.getByText(/No pages match/)).toBeVisible();
  await search.fill("daily checks");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/checks$/);
  await expect(page.getByRole("heading", { name: "Daily Kitchen Checks", exact: true })).toBeVisible();
  await page.goto("/admin/vault");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "A good shift starts here." })).toBeVisible();
});

test("mobile navigation contains keyboard focus and restores it when closed", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInFoodSafe(page, "manager");
  await expect(page.getByRole("button", { name: "Refresh dashboard" })).toBeEnabled();
  await capture(page, info, "mobile-manager-dashboard");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  const navigation = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(navigation).toBeVisible();
  const first = navigation.getByRole("link").first();
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(navigation.getByRole("button", { name: "Sign out", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(navigation).toHaveCount(0);
  await trigger.click();
  await page.getByRole("navigation", { name: "Pages", exact: true }).getByRole("link", { name: "Daily checks", exact: true }).click();
  await expect(page).toHaveURL(/\/checks$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await capture(page, info, "mobile-daily-checks");
});
