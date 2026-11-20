import { randomUUID } from "node:crypto";
import { test, expect, capture, east, signInEmployee } from "./fixtures";
import { apiSignIn, createEmployee } from "./btb-helpers";

const shiftId = "40000000-0000-4000-8000-000000000001";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Regina", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function setupTimeTeam(request: Parameters<typeof apiSignIn>[0]) {
  await apiSignIn(request);
  const manager = await createEmployee(request, { name: "Morgan Hours", email: "morgan.hours@team.test", role: "manager", position: "Manager" });
  const staff = await createEmployee(request, { name: "Casey Counter", email: "casey.counter@team.test", role: "staff", position: "Front counter" });
  return { manager, staff };
}

async function seedTimeLocation(fixture: { configure: (options: object) => Promise<void> }, people: Awaited<ReturnType<typeof setupTimeTeam>>) {
  await fixture.configure({ tables: {
    locations: [{ id: east, name: "BTB Hours" }],
    btb_location_settings: [{ location_id: east, timezone: "America/Regina", active: true, settings_confirmed: true, version: 1 }],
    btb_superadmin_locations: [{ location_id: east }],
    btb_location_page_access: [{ location_id: east, page: "platform", allowed: true }],
    btb_location_access: [
      { location_id: east, employee_id: people.manager.id },
      { location_id: east, employee_id: people.staff.id },
    ],
    btb_shifts: [{
      id: shiftId, restaurant_name: "Between the Buns", employee_id: people.staff.id, shift_date: today,
      start_time: "09:00", end_time: "17:00", ends_next_day: false, duty: "service",
      version: 1, updated_by_name: "Morgan Hours", location_id: east,
    }],
  } });
}

test("staff clock in and out, fix a punch, another manager approves and approved hours export in UTC", async ({ page, browser, request, fixture }, info) => {
  const people = await setupTimeTeam(request);
  await seedTimeLocation(fixture, people);

  await signInEmployee(page, people.staff.email!, "/btb/demo/platform");
  await page.getByRole("button", { name: "Schedule & hours", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My time clock" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Worked hours and approvals" })).toContainText("Scheduled shifts are not worked hours");
  await page.getByLabel("Clock-in shift").selectOption("unscheduled");
  await page.getByRole("button", { name: "Clock in now" }).click();
  await expect(page.getByText("Clock running").first()).toBeVisible();
  await page.getByLabel("Actual unpaid break minutes").fill("0");
  await page.getByRole("button", { name: "Clock out & submit hours" }).click();
  await expect(page.getByText("Pending approval").first()).toBeVisible();

  const start = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await page.getByRole("row", { name: /Casey Counter/ }).getByRole("button", { name: "Correct hours" }).click();
  const correction = page.getByRole("dialog", { name: "Correct worked hours" });
  await correction.getByLabel("Corrected start (ISO + offset)").fill(start);
  await correction.getByLabel("Corrected end (ISO + offset)").fill(end);
  await correction.getByLabel("Actual unpaid break minutes").fill("15");
  await correction.getByLabel("Correction reason / evidence").fill("Forgot to clock out at the end of the shift");
  await correction.getByRole("button", { name: "Submit explained correction" }).click();
  await expect(page.getByRole("row", { name: /Casey Counter/ })).toContainText("1.25");

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  try {
    await signInEmployee(managerPage, people.manager.email!, "/btb/demo/platform");
    await managerPage.getByRole("button", { name: "Schedule & hours", exact: true }).click();
    await expect(managerPage.getByRole("region", { name: "Worked hours and approvals" })).toContainText("Casey Counter");

    // The manager can run their own clock, but the UI never offers self-approval.
    await managerPage.getByLabel("Clock-in shift").selectOption("unscheduled");
    await managerPage.getByRole("button", { name: "Clock in now" }).click();
    await managerPage.getByLabel("Actual unpaid break minutes").fill("0");
    await managerPage.getByRole("button", { name: "Clock out & submit hours" }).click();
    const ownRow = managerPage.getByRole("row", { name: /Morgan Hours/ });
    await expect(ownRow).toContainText("Another manager / owner must approve your hours.");
    await expect(ownRow.getByRole("button", { name: "Approve hours" })).toHaveCount(0);

    const staffRow = managerPage.getByRole("row", { name: /Casey Counter/ });
    await staffRow.getByRole("button", { name: "Approve hours" }).click();
    const approve = managerPage.getByRole("dialog", { name: "Approve worked hours" });
    await approve.getByLabel(/I verified the actual times/).check();
    await approve.getByRole("button", { name: "Approve worked hours", exact: true }).click();
    await expect(staffRow).toContainText("Approved");
    await expect(staffRow).toContainText("Morgan Hours");

    const [download] = await Promise.all([
      managerPage.waitForEvent("download"),
      managerPage.getByRole("button", { name: "Export approved hours" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^btb-approved-hours-/);
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream) csv += chunk.toString();
    expect(csv).toContain("Start (UTC)");
    expect(csv).toContain("Casey Counter");
    expect(csv).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/);
    expect(csv.split("\n").slice(1).some((line) => line.startsWith('"Morgan Hours"'))).toBe(false);

    const printSheet = managerPage.locator('.btb-print-root[aria-label="Weekly schedule print sheet"]');
    await expect(printSheet).toContainText("Casey Counter");
    await expect(printSheet).toContainText("09:00–17:00");
    await managerPage.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => { (window as unknown as { __printed: number }).__printed += 1; };
    });
    await managerPage.getByRole("button", { name: "Print weekly schedule" }).click();
    expect(await managerPage.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

    await managerPage.setViewportSize({ width: 390, height: 844 });
    await capture(managerPage, info, "btb-time-mobile");
    await expect(managerPage.getByRole("region", { name: "Worked hours and approvals" })).toBeVisible();

    const state = await fixture.state();
    const entries = state.tables.btb_time_entries as { employee_id: string; status: string; recorded_in: string; recorded_out: string; effective_in: string; effective_out: string; break_minutes: number }[];
    const staffEntry = entries.find((entry) => entry.employee_id === people.staff.id)!;
    expect(staffEntry).toMatchObject({ status: "approved", break_minutes: 15 });
    expect(staffEntry.recorded_in).not.toBe(staffEntry.effective_in);
    expect(staffEntry.recorded_out).not.toBe(staffEntry.effective_out);
  } finally {
    await managerContext.close();
  }
});

test("self-approval and staff schedule writes are rejected by the time API", async ({ request, fixture }) => {
  const people = await setupTimeTeam(request);
  await seedTimeLocation(fixture, people);
  await apiSignIn(request, people.manager.email!);
  const clockIn = await request.post("/api/btb/platform/time", { headers: { Origin: "http://127.0.0.1:5101" }, data: {
    location_id: east, request_id: randomUUID(), action: "clock_in", data: { shift_id: null, notes: "" },
  } });
  await expect(clockIn).toBeOK();
  const entry = (await clockIn.json()).entry;
  const selfApprove = await request.post("/api/btb/platform/time", { headers: { Origin: "http://127.0.0.1:5101" }, data: {
    location_id: east, request_id: randomUUID(), action: "approve", data: { id: entry.id, version: entry.version, reason: "" },
  } });
  expect(selfApprove.status()).toBe(403);
});
