import { test, expect, capture, signInBtb, signInFoodSafe, signInEmployee, east } from "./fixtures";
import { apiSignIn, createEmployee } from "./btb-helpers";
import { btbToday } from "../src/lib/btb-team";

const owner = "10000000-0000-4000-8000-000000000098";
const id = "91000000-0000-4000-8000-000000000001";
const input = { id, record_type: "cold_storage", equipment_name: "Walk-in fridge", food_item: "Dairy", temperature: 8, min_safe_temp: 0, max_safe_temp: 4, notes: "Moved stock to working fridge." };
const row = { ...input, user_id: owner, restaurant_name: "Between the Buns", location_id: null, unit: "C", is_safe: false, recorded_at: new Date().toISOString() };

test("BTB temperature saves retain failures, survive reload and keep independent FoodSafe sessions", async ({ page, fixture }, info) => {
  await signInFoodSafe(page, "manager");
  await signInBtb(page, "manager");
  await page.getByRole("searchbox", { name: "Search BTB tools" }).fill("temperature sheet");
  await page.locator('#btb-tools a[href="/between-the-buns/temperatures"]').click();
  await page.getByRole("button", { name: "Add reading", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Equipment", { exact: true })).toBeFocused();
  await dialog.getByLabel("Equipment", { exact: true }).fill(input.equipment_name);
  await dialog.getByLabel("Food or storage item").fill(input.food_item);
  await dialog.getByLabel("Temperature (°C)", { exact: true }).fill("8");
  await dialog.getByLabel("Target minimum (°C)").fill("0");
  await dialog.getByLabel("Target maximum (°C)").fill("4");
  await dialog.getByLabel("Notes / corrective action", { exact: false }).fill(input.notes);
  await fixture.configure({ failures: [{ table: "temperature_records", method: "POST", times: 1 }] });
  await dialog.getByRole("button", { name: "Save reading" }).click();
  await expect(dialog.getByRole("alert")).toContainText("reading wasn’t saved");
  await expect(dialog.getByLabel("Temperature (°C)", { exact: true })).toHaveValue("8");
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "temperature-mobile-retained-draft");
  await dialog.getByRole("button", { name: "Save reading" }).click();
  await expect(dialog).toHaveCount(0);
  const reading = page.getByRole("article", { name: "Walk-in fridge · Dairy" });
  await expect(reading).toContainText("Outside target");
  await expect(reading).toContainText("Manager (shared workspace)");
  const saved = (await fixture.state()).tables.temperature_records.find((record) => record.user_id === owner)!;
  expect(saved).toMatchObject({ restaurant_name: "Between the Buns", location_id: null, temperature: 8, is_safe: false });
  await page.reload();
  await expect(reading).toBeVisible();
  await capture(page, info, "temperature-mobile-history");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("tab", { name: "History (90 days)" }).click();
  await page.getByLabel("Filter by date").fill(btbToday());
  await expect(reading).toBeVisible();
  await capture(page, info, "temperature-desktop-history");
  await page.getByText("Looking for earlier FoodSafe records?", { exact: true }).click();
  await page.getByRole("link", { name: "Open FoodSafe temperature records" }).click();
  await expect(page.getByText("Cheese", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Temperature Monitoring" })).toBeVisible();
});

test("temperature history excludes other owners, restaurants, sites and older rows; all pages load", async ({ request, fixture }) => {
  const records = Array.from({ length: 1001 }, (_, index) => ({ ...row, id: `91000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` }));
  await fixture.configure({ tables: { temperature_records: [...records,
    { ...row, id: "other-restaurant", restaurant_name: "Another restaurant" },
    { ...row, id: "other-owner", user_id: "10000000-0000-4000-8000-000000000002" },
    { ...row, id: "other-site", location_id: east },
    { ...row, id: "older", recorded_at: new Date(Date.now() - 91 * 86_400_000).toISOString() },
  ] } });
  await apiSignIn(request);
  const response = await request.get("/api/btb/temperatures");
  await expect(response).toBeOK();
  const result = await response.json();
  expect(result.records).toHaveLength(1001);
  expect(result.records.every((record: { id: string }) => record.id.startsWith("91000000"))).toBe(true);
});

test("temperature retries are append-once and ignore forged identity, location, time and status", async ({ request, fixture }) => {
  await apiSignIn(request);
  const body = { ...input, user_id: "forged", restaurant_name: "Another restaurant", location_id: east, is_safe: true, recorded_at: "2020-01-01", recorded_by: "Not the manager" };
  const replies = await Promise.all([request.post("/api/btb/temperatures", { data: body }), request.post("/api/btb/temperatures", { data: body })]);
  for (const response of replies) await expect(response).toBeOK();
  expect((await fixture.state()).tables.temperature_records.filter((record) => record.id === id)).toHaveLength(1);
  const saved = (await replies[0].json()).record;
  expect(saved.is_safe).toBe(false);
  expect(saved.recorded_at).not.toBe("2020-01-01");
  expect(saved.notes).toContain("Manager (shared workspace)");
  const conflict = await request.post("/api/btb/temperatures", { data: { ...input, temperature: 3 } });
  expect(conflict.status()).toBe(409);
  const invalid = await request.post("/api/btb/temperatures", { data: { ...input, temperature: "" } });
  expect(invalid.status()).toBe(400);
});

test("temperature endpoints enforce login, operational permissions and saved page restrictions", async ({ page, request, fixture }) => {
  expect((await request.get("/api/btb/temperatures")).status()).toBe(401);
  await signInBtb(page, "corporate", "/between-the-buns/temperatures");
  await expect(page.getByRole("heading", { name: "No readings saved today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add reading", exact: true })).toHaveCount(0);
  expect((await page.request.post("/api/btb/temperatures", { data: input })).status()).toBe(403);
  for (const role of ["staff", "supervisor"] as const) {
    await apiSignIn(request, `${role}@foodsafe.demo`);
    await expect(await request.get("/api/btb/temperatures")).toBeOK();
  }
  await apiSignIn(request, "admin@foodsafe.demo");
  expect((await request.get("/api/btb/temperatures")).status()).toBe(403);
  await fixture.configure({ tables: { role_page_access: [{ role: "manager", page: "temperatures", allowed: false }] } });
  await signInBtb(page, "manager", "/between-the-buns/temperatures");
  await expect(page.getByRole("heading", { name: "This page isn’t in your workspace." })).toBeVisible();
  expect((await page.request.get("/api/btb/temperatures")).status()).toBe(403);
  expect((await page.request.post("/api/btb/temperatures", { data: input })).status()).toBe(403);
});

test("individual temperature readings use the verified employee and reject ended sessions and cross-site writes", async ({ page, request, fixture }) => {
  await apiSignIn(request);
  const employee = await createEmployee(request);
  await signInEmployee(page, employee.email!, "/between-the-buns/temperatures");
  const response = await page.request.post("/api/btb/temperatures", { data: input });
  await expect(response).toBeOK();
  expect((await response.json()).record.notes).toContain(`Recorded by: ${employee.name} [${employee.id}]`);
  expect((await page.request.post("/api/btb/temperatures", { headers: { Origin: "https://another.test" }, data: input })).status()).toBe(403);
  const state = await fixture.state();
  await fixture.configure({ tables: { btb_employees: state.tables.btb_employees.map((item) => ({ ...item, active: false })) } });
  expect((await page.request.get("/api/btb/temperatures")).status()).toBe(401);
});

test("history failures show retry rather than an empty register; unverified storage cannot own readings", async ({ page, request, fixture }) => {
  await fixture.configure({ failures: [{ table: "temperature_records", method: "GET", times: 1 }] });
  await signInBtb(page, "manager", "/between-the-buns/temperatures");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("history couldn’t be loaded");
  await expect(page.getByRole("button", { name: "Add reading", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No readings saved today" })).toBeVisible();
  const state = await fixture.state();
  await fixture.configure({ tables: { profiles: state.tables.profiles.map((profile) => profile.id === owner ? { ...profile, btb_uploader: false } : profile) } });
  await apiSignIn(request);
  expect((await request.post("/api/btb/temperatures", { data: input })).status()).toBe(503);
  expect((await fixture.state()).tables.temperature_records.some((record) => record.id === id)).toBe(false);
});
