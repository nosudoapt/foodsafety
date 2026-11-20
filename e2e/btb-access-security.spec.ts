import { randomUUID } from "node:crypto";
import { test, expect, east, west, fixtureUrl, signInEmployee, signInFoodSafe } from "./fixtures";
import { accessTables, anonHeaders, consoleApiSignIn, managedManager, managedStaff, managerEmail, staffEmail, origin, pageToken, updateLocationPages } from "./btb-access-fixtures";

const pdf = Buffer.from("%PDF-1.4\nPage grant security verification");
const file = { name: "page-grants.pdf", url: `data:application/pdf;base64,${pdf.toString("base64")}` };
const uploader = "10000000-0000-4000-8000-000000000099";
const contact = { id: "82000000-0000-4000-8000-000000000001", restaurant_name: "Between the Buns", category: "plumber", name: "Private BTB plumbing", phone: "306-555-0123" };
const book = { id: "83000000-0000-4000-8000-000000000001", restaurant_name: "Between the Buns", title: "Saved BTB Handbook", version: "2.0", body: "Read the approved BTB shift procedure." };

test("browser capabilities use anon alongside FoodSafe, separate pages/modes and revoke live grants and credentials", async ({ page, request, fixture }) => {
  await fixture.configure({ tables: { ...accessTables({ [east]: ["emergency", "prep-manual"], [west]: [] }), emergency_contacts: [contact] } });
  await consoleApiSignIn(request);
  await signInFoodSafe(page, "owner");
  await signInEmployee(page, managerEmail, "/btb/demo/emergency");
  await page.getByRole("button", { name: /Plumber.*1 of 3 saved/ }).click();
  await expect(page.locator('input[value="Private BTB plumbing"]')).toBeVisible();
  const state = await fixture.state();
  const reads = state.requests.filter(row => row.path.endsWith("/emergency_contacts") && row.method === "GET");
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every(row => row.authorization === "anon" && row.capability)).toBe(true);
  const read = await pageToken(page.request, "emergency");
  const write = await pageToken(page.request, "emergency", "write");
  expect(write).not.toBe(read);
  const endpoint = `${fixtureUrl}/rest/v1/emergency_contacts`;
  const denied = await request.patch(`${endpoint}?id=eq.${contact.id}`, { headers: { ...anonHeaders(read), Prefer: "return=representation" }, data: { name: "Read token mutation" } });
  // RLS hides non-writable rows from UPDATE; PostgREST may return success with
  // zero affected rows. Assert both the returned rows and the stored value.
  await expect(denied).toBeOK();
  expect(await denied.json()).toEqual([]);
  expect((await fixture.state()).tables.emergency_contacts).toEqual([expect.objectContaining(contact)]);
  expect((await request.post(endpoint, { headers: anonHeaders(read), data: { ...contact, id: randomUUID(), name: "Read token insertion" } })).status()).toBe(403);
  const saved = await request.patch(`${endpoint}?id=eq.${contact.id}`, { headers: { ...anonHeaders(write), Prefer: "return=representation" }, data: { name: "Allowed write" } });
  await expect(saved).toBeOK();
  expect(await saved.json()).toEqual([expect.objectContaining({ id: contact.id, name: "Allowed write" })]);
  expect((await fixture.state()).tables.emergency_contacts).toEqual([expect.objectContaining({ ...contact, name: "Allowed write" })]);
  expect(await (await request.get(`${fixtureUrl}/rest/v1/print_manuals?select=id`, { headers: anonHeaders(read) })).json()).toEqual([]);
  expect(await (await request.get(`${endpoint}?select=id`, { headers: anonHeaders() })).json()).toEqual([]);
  await updateLocationPages(request, east, ["prep-manual"]);
  expect(await (await request.get(`${endpoint}?select=id`, { headers: anonHeaders(write) })).json()).toEqual([]);
  const revoked = await request.patch(`${endpoint}?id=eq.${contact.id}`, { headers: { ...anonHeaders(write), Prefer: "return=representation" }, data: { name: "Revoked mutation" } });
  expect(await revoked.json()).toEqual([]);
  expect((await fixture.state()).tables.emergency_contacts).toEqual([expect.objectContaining({ ...contact, name: "Allowed write" })]);
  expect((await page.request.get("/api/btb/public-token?page=emergency&mode=read")).status()).toBe(403);
  await updateLocationPages(request, east, ["emergency", "prep-manual"]);
  const current = await pageToken(page.request, "emergency");
  const credentials = (await fixture.state()).tables.btb_employee_credentials;
  await fixture.configure({ tables: { btb_employee_credentials: credentials.map(row => row.employee_id === managedManager ? { ...row, session_version: 2 } : row) } });
  expect(await (await request.get(`${endpoint}?select=id`, { headers: anonHeaders(current) })).json()).toEqual([]);
  expect(await (await page.request.get("/api/btb/me")).json()).toMatchObject({ authenticated: false });
});

for (const boundary of ["token", "data"] as const) {
  for (const transition of ["logout", "identity"] as const) {
    test(`a late ${boundary} response cannot survive a cross-tab ${transition} transition`, async ({ page, context, fixture }) => {
      await fixture.configure({ tables: { ...accessTables({ [east]: ["emergency", "prep-manual"], [west]: [] }), emergency_contacts: [contact],
        role_page_access: [{ role: "staff", page: "emergency", allowed: false }],
      } });
      await signInEmployee(page, managerEmail, "/btb/demo/account");
      let notify!: () => void;
      let release!: () => void;
      let completed!: () => void;
      const held = new Promise<void>(resolve => { notify = resolve; });
      const resumed = new Promise<void>(resolve => { release = resolve; });
      const done = new Promise<void>(resolve => { completed = resolve; });
      const pattern = boundary === "token" ? "**/api/btb/public-token?*" : "**/rest/v1/emergency_contacts?*";
      await page.route(pattern, async route => {
        try {
          const response = await route.fetch();
          notify();
          await resumed;
          await route.fulfill({ response });
        } catch { /* The real AbortController may already have cancelled it. */ }
        finally { completed(); }
      });
      const other = await context.newPage();
      try {
        await page.goto("/btb/demo/emergency");
        await held;
        if (transition === "logout") {
          await other.goto("/btb/demo/account");
          await other.getByRole("button", { name: "Sign out", exact: true }).click();
          await expect(other).toHaveURL(/\/btb\/login$/);
          await expect(page).toHaveURL(/\/btb\/login/);
        } else {
          await signInEmployee(other, staffEmail, "/btb/demo/prep-manual");
          await expect(page.getByRole("heading", { name: "This page isn’t in your workspace." })).toBeVisible();
          expect(await (await page.request.get("/api/btb/me")).json()).toMatchObject({ employeeId: managedStaff });
        }
        release();
        await done;
        await expect(page.locator('input[value="Private BTB plumbing"]')).toHaveCount(0);
        await expect(page.getByText("Private BTB plumbing", { exact: true })).toHaveCount(0);
        const signal = await page.evaluate(() => localStorage.getItem("btb-session-change"));
        expect(signal).toMatch(/^[0-9a-f-]{36}$/);
        if (boundary === "token") expect((await fixture.state()).requests.filter(row => row.path.endsWith("/emergency_contacts"))).toHaveLength(0);
      } finally { release(); await other.close(); }
    });
  }
}

test("activity uses the selected product and server-owned single-location attribution, never browser identity or location", async ({ page, fixture }) => {
  await fixture.configure({ tables: { ...accessTables({ [east]: ["emergency", "prep-manual"], [west]: ["prep-manual"] }), app_activity: [] } });
  await signInFoodSafe(page, "owner");
  await signInEmployee(page, managerEmail, "/btb/demo/account");
  const visit = await page.request.post("/api/activity?workspace=btb", { headers: origin, data: { path: "/btb/demo/prep-manual", actor_id: "forged", actor_name: "Forged", location_id: west, title: "Forged title" } });
  await expect(visit).toBeOK();
  const saved = (await fixture.state()).tables.app_activity.find(row => row.path === "/btb/demo/prep-manual");
  expect(saved).toMatchObject({ actor_id: managedManager, actor_type: "btb", actor_name: "Morgan Manager", restaurant_name: "Between the Buns", location_id: east });
  expect(saved?.title).not.toBe("Forged title");
  expect((await page.request.post("/api/activity", { headers: origin, data: { path: "/btb/demo/emergency" } })).status()).toBe(403);
  expect((await page.request.post("/api/activity?workspace=btb", { headers: origin, data: { path: "/dashboard" } })).status()).toBe(403);
  expect((await page.request.post("/api/activity?workspace=btb", { headers: origin, data: { path: "/btb/admin" } })).status()).toBe(403);
  expect((await page.request.post("/api/activity?workspace=btb", { headers: origin, data: { path: "/btb/demo/menu" } })).status()).toBe(403);
  await expect(await page.request.post("/api/activity", { headers: origin, data: { path: "/admin/vault", location_id: west } })).toBeOK();
  const visits = (await fixture.state()).tables.app_activity;
  expect(visits.find(row => row.path === "/admin/vault")).toMatchObject({ actor_type: "user", actor_id: "10000000-0000-4000-8000-000000000003", restaurant_name: "The Test Kitchen", location_id: east });
  const mine = await (await page.request.get("/api/activity?workspace=btb")).json();
  expect(mine.recent.some((row: { path: string }) => row.path === "/btb/demo/prep-manual")).toBe(true);
  expect(mine.recent.some((row: { path: string }) => row.path === "/admin/vault")).toBe(false);
  await fixture.configure({ tables: { btb_location_access: [{ location_id: east, employee_id: managedManager }, { location_id: west, employee_id: managedManager }, { location_id: east, employee_id: managedStaff }] } });
  await expect(await page.request.post("/api/activity?workspace=btb", { headers: origin, data: { path: "/btb/demo/emergency", location_id: east } })).toBeOK();
  expect((await fixture.state()).tables.app_activity.find(row => row.path === "/btb/demo/emergency")).toMatchObject({ location_id: null });
  await fixture.configure({ failures: [{ table: "app_activity", method: "GET", times: 1 }] });
  expect((await page.request.get("/api/activity?workspace=btb")).status()).toBe(503);
});

test("mixed-cookie vault requests never select another product or restaurant, and saved grants gate reads and reveals", async ({ page, request, fixture }) => {
  const btbId = randomUUID();
  const greenId = randomUUID();
  await fixture.configure({ tables: { ...accessTables({ [east]: ["vault"], [west]: [] }), login_vault: [
    { id: btbId, restaurant_name: "Between the Buns", service: "BTB POS", category: "pos", secret: "synthetic-btb-secret" },
    { id: greenId, restaurant_name: "The Test Kitchen", service: "FoodSafe POS", category: "pos", secret: "synthetic-green-secret" },
  ] } });
  await consoleApiSignIn(request);
  await signInFoodSafe(page, "owner");
  await signInEmployee(page, managerEmail, "/btb/demo/vault");
  await expect(page.getByText("BTB POS", { exact: true })).toBeVisible();
  await expect(page.getByText("FoodSafe POS", { exact: true })).toHaveCount(0);
  const btb = await page.request.get("/api/vault?workspace=btb&restaurant_name=The%20Test%20Kitchen");
  expect((await btb.json()).entries.map((row: { id: string }) => row.id)).toEqual([btbId]);
  expect(await btb.text()).not.toContain("synthetic-btb-secret");
  const green = await page.request.get("/api/vault");
  expect((await green.json()).entries.map((row: { id: string }) => row.id)).toEqual([greenId]);
  expect((await page.request.post("/api/vault/reveal?workspace=btb", { headers: origin, data: { id: greenId } })).status()).toBe(404);
  expect((await page.request.post("/api/vault/reveal", { headers: origin, data: { id: btbId } })).status()).toBe(404);
  expect(await (await page.request.post("/api/vault/reveal?workspace=btb", { headers: origin, data: { id: btbId } })).json()).toEqual({ secret: "synthetic-btb-secret" });
  expect((await page.request.post("/api/vault/reveal?workspace=btb", { headers: { Origin: "https://outside.example" }, data: { id: btbId } })).status()).toBe(403);
  await updateLocationPages(request, east, []);
  expect((await page.request.get("/api/vault?workspace=btb")).status()).toBe(403);
  expect((await page.request.post("/api/vault/reveal?workspace=btb", { headers: origin, data: { id: btbId } })).status()).toBe(403);
  await expect(await page.request.get("/api/vault")).toBeOK();
});

test("exact reference slots, independent manuals editing and personal handbook acknowledgements enforce live grants", async ({ page, request, fixture }) => {
  const historical = { id: randomUUID(), user_id: uploader, restaurant_name: "Between the Buns", title: "Other operations PDF", category: "operations", file_name: file.name, file_url: file.url, file_size: pdf.byteLength };
  await fixture.configure({ tables: { ...accessTables({ [east]: ["prep-manual", "handbook"], [west]: [] }), print_manuals: [historical], handbook_documents: [book] } });
  await consoleApiSignIn(request);
  await signInEmployee(page, managerEmail, "/btb/demo/prep-manual");
  await expect(page.getByRole("button", { name: /Add PDF/ })).toHaveCount(0);
  const noFallback = await page.request.get("/api/btb/reference-pdf?slot=prep-manual");
  expect(await noFallback.json()).toEqual({ manual: null });
  expect((await page.request.get("/api/btb/reference-pdf?slot=allergen-chart")).status()).toBe(403);
  expect((await page.request.post("/api/btb/reference-pdf", { headers: origin, data: { slot: "prep-manual", file } })).status()).toBe(403);
  expect((await page.request.post("/api/btb/manuals", { headers: origin, data: { title: "Denied", category: "operations", file } })).status()).toBe(403);
  await updateLocationPages(request, east, ["prep-manual", "manuals", "handbook"]);
  await page.reload();
  await expect(page.getByRole("button", { name: /Add PDF/ }).first()).toBeVisible();
  await expect(await page.request.post("/api/btb/reference-pdf", { headers: origin, data: { slot: "prep-manual", title: "Forged", category: "other", restaurant_name: "The Test Kitchen", file } })).toBeOK();
  const manual = (await (await page.request.get("/api/btb/reference-pdf?slot=prep-manual")).json()).manual;
  expect(manual).toMatchObject({ title: "Prep manual", file_name: file.name, file_size: pdf.byteLength });
  expect((await fixture.state()).tables.print_manuals.find(row => row.id === manual.id)).toMatchObject({ user_id: uploader, restaurant_name: "Between the Buns", category: "operations" });
  const oversized = { name: file.name, url: `data:application/pdf;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64")}` };
  expect((await page.request.post("/api/btb/manuals", { headers: origin, data: { title: "Too large", category: "operations", file: oversized } })).status()).toBe(413);
  expect((await page.request.post("/api/btb/reference-pdf", { headers: origin, data: { slot: "prep-manual", file: oversized } })).status()).toBe(413);
  await signInEmployee(page, staffEmail, "/btb/demo/handbook");
  await expect(page.getByRole("heading", { name: book.title })).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Sam Staff");
  await page.getByLabel("Type name again to sign").fill("Sam Staff");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page.getByText("1 signed", { exact: true })).toBeVisible();
  const payload = { handbook_id: book.id, staff_name: "Morgan Manager", signature: "Morgan Manager" };
  expect((await page.request.post("/api/btb/handbook", { headers: origin, data: payload })).status()).toBe(400);
  expect((await page.request.post("/api/btb/handbook", { headers: origin, data: { ...payload, staff_name: "Sam Staff", signature: "Sam Staff", handbook_id: randomUUID() } })).status()).toBe(404);
  expect((await page.request.get("/api/btb/public-token?page=handbook&mode=write")).status()).toBe(403);
  await updateLocationPages(request, east, ["prep-manual", "manuals"]);
  expect((await page.request.post("/api/btb/handbook", { headers: origin, data: { ...payload, staff_name: "Sam Staff", signature: "Sam Staff" } })).status()).toBe(403);
});
