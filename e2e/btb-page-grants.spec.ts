import { test, expect, capture, east, west, signInEmployee, signInBtb } from "./fixtures";
import { signInConsole, consoleSites } from "./btb-console-fixtures";
import { accessTables, consoleApiSignIn, managedManager, managerEmail, staffEmail, origin, updateLocationPages } from "./btb-access-fixtures";

test("console page grants start denied, support keyboard/search selection and retain failed drafts at every viewport", async ({ page, fixture }, info) => {
  await fixture.configure({ tables: consoleSites });
  await signInConsole(page, `/btb/admin/locations/${east}`);
  const picker = page.getByRole("region", { name: "Allowed workspace pages" });
  await expect(picker.getByRole("checkbox").first()).not.toBeChecked();
  await picker.getByRole("checkbox", { name: /^Prep Manual\b/ }).focus();
  await page.keyboard.press("Space");
  await picker.getByLabel("Find a workspace page").fill("emergency");
  await picker.getByRole("button", { name: "Select matches", exact: true }).click();
  await expect(picker.getByRole("checkbox")).toBeChecked();
  await picker.getByLabel("Find a workspace page").fill("no-matching-page");
  await expect(picker.getByRole("status")).toContainText("No pages match");
  await picker.getByLabel("Find a workspace page").fill("");
  await fixture.configure({ failures: [{ table: "btb_admin_update_location", method: "POST", times: 1 }] });
  await page.getByRole("button", { name: "Save location", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your draft is still here");
  await expect(picker.getByRole("checkbox", { name: /^Emergency/ })).toBeChecked();
  await page.getByRole("button", { name: "Save location", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Location saved" })).toBeVisible();
  await page.reload();
  await expect(picker.getByRole("checkbox", { name: /^Emergency/ })).toBeChecked();
  await expect(picker.getByRole("checkbox", { name: /^Prep Manual\b/ })).toBeChecked();
  expect((await fixture.state()).tables.btb_location_page_access.filter(row => row.location_id === east).map(row => row.page).sort()).toEqual(["emergency", "prep-manual"]);
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(page, info, `console-page-grants-${width}`);
  }
});

test("effective grants union active assignments, intersect role restrictions and protect direct HTML and Flight URLs", async ({ page, request, fixture }) => {
  await fixture.configure({ tables: { ...accessTables({ [east]: ["platform", "prep-manual", "emergency", "vault", "compliance"], [west]: ["manuals", "allergen-chart"] }),
    btb_location_access: [{ location_id: east, employee_id: managedManager }, { location_id: west, employee_id: managedManager }],
    role_page_access: [{ role: "manager", page: "emergency", allowed: false }],
  } });
  await consoleApiSignIn(request);
  await signInEmployee(page, managerEmail);
  const me = await (await page.request.get("/api/btb/me")).json();
  expect(me.employeeId).toBe(managedManager);
  expect(me.access.locationIds.sort()).toEqual([east, west]);
  expect(me.access.pages.sort()).toEqual(["allergen-chart", "compliance", "manuals", "platform", "prep-manual", "vault"]);
  await expect(page.locator('#btb-tools a[href="/btb/demo/prep-manual"]')).toBeVisible();
  await expect(page.locator('#btb-tools a[href="/btb/demo/emergency"]')).toHaveCount(0);
  await expect(page.locator('#btb-tools a[href="/btb/demo/menu"]')).toHaveCount(0);
  await page.getByLabel("Search BTB pages").fill("recipe");
  await expect(page.getByRole("listbox", { name: "Search BTB tools" })).not.toContainText("Recipe Cheat");
  const variants: Record<string, string>[] = [{}, { RSC: "1" }];
  for (const headers of variants) {
    const denied = await page.request.get("/btb/demo/menu", { headers });
    const body = await denied.text();
    expect(body).toContain("This page isn");
    expect(body).toContain("data-btb-access-denied");
    // The shell can name the requested route, but never includes its view,
    // recipe data, search controls or print surface in HTML or Flight.
    expect(body).not.toContain("Recipe Cheat Sheets — Menu Specifications");
    expect(body).not.toContain("Search recipes or ingredients");
    expect(body).not.toContain("print-section");
  }
  await updateLocationPages(request, west, ["manuals", "allergen-chart"], false);
  await page.reload();
  const after = await (await page.request.get("/api/btb/me")).json();
  // Closing a site retains membership/history, but it contributes no grants.
  expect(after.access.locationIds.sort()).toEqual([east, west]);
  expect(after.access.locations).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: east, active: true }), expect.objectContaining({ id: west, active: false }),
  ]));
  expect(after.access.pageGrants.sort()).toEqual(["compliance", "emergency", "platform", "prep-manual", "vault"]);
  expect(after.access.pages).not.toContain("manuals");
  expect(after.access.pages).not.toContain("allergen-chart");
  await page.goto("/btb/demo/manuals");
  await expect(page.getByRole("heading", { name: "This page isn’t in your workspace." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Manual", exact: false })).toHaveCount(0);
});

test("granting a page never expands a staff role or reopens legacy operations for managed people", async ({ page, fixture }) => {
  await fixture.configure({ tables: accessTables({ [east]: ["prep-list", "platform", "vault", "compliance", "documents", "emergency"], [west]: [] }) });
  await signInEmployee(page, staffEmail);
  const { access } = await (await page.request.get("/api/btb/me")).json();
  expect(access.pages.sort()).toEqual(["emergency", "platform", "prep-list"]);
  expect((await page.request.get("/api/vault?workspace=btb")).status()).toBe(403);
  expect((await page.request.get("/api/btb/documents")).status()).toBe(403);
  expect((await page.request.get("/api/btb/public-token?page=prep-list&mode=write")).status()).toBe(403);
  expect((await page.request.post("/api/btb/orders", { headers: origin, data: {} })).status()).toBe(403);
});

test("removed people lose all location pages without gaining legacy access; demo credentials remain demo-only", async ({ page, request, fixture }) => {
  await fixture.configure({ tables: accessTables() });
  await consoleApiSignIn(request);
  await signInEmployee(page, managerEmail, "/btb/demo/emergency");
  await expect(page.getByRole("heading", { name: "Emergency Contacts" })).toBeVisible();
  await expect(await request.delete(`/api/btb/admin/locations/${east}/people/${managedManager}`, { headers: origin })).toBeOK();
  expect(await (await page.request.get("/api/btb/me")).json()).toMatchObject({ authenticated: false });
  const state = await fixture.state();
  expect(state.tables.btb_invitations.some(row => row.employee_id === managedManager)).toBe(true);
  expect(state.tables.btb_location_access.some(row => row.employee_id === managedManager)).toBe(false);
  await signInBtb(page, "manager");
  expect(await (await page.request.get("/api/btb/admin/me")).json()).toMatchObject({ authenticated: false });
  await expect(page.locator('#btb-tools a[href="/btb/demo/prep-list"]')).toBeVisible();
});

test("a failed access resolver withholds reference content and metrics instead of using legacy defaults", async ({ page, fixture }) => {
  await signInBtb(page, "manager", "/btb/demo/prep-manual");
  await fixture.configure({ failures: [{ table: "btb_employee_page_grants", method: "POST", times: -1 }] });
  // Personal identities, unlike shared tablets, must resolve saved assignments.
  await fixture.configure({ tables: accessTables() });
  await signInEmployee(page, managerEmail);
  const response = await page.request.get("/btb/demo/menu", { headers: { RSC: "1" } });
  expect(await response.text()).not.toContain("Search recipes or ingredients");
  expect((await page.request.get("/api/btb/overview")).status()).toBe(503);
});
