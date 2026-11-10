import { readFile } from "node:fs/promises";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, capture, east, signInBtb, signInEmployee } from "./fixtures";
import { apiSignIn, createEmployee, restaurant } from "./btb-helpers";
import { btbToday } from "../src/lib/btb-team";
import { addDays } from "../src/lib/staff-schedule";
import type { ReminderRun, ReminderSettings } from "../src/lib/btb-reminders";
import type { StaffLicence } from "../src/lib/btb-licences";

const endpoint = "/api/btb/licence-reminders";
const cron = "/api/cron/btb-licence-reminders";
const cronHeaders = { Authorization: "Bearer browser-test-cron-secret" };
const documentId = "70000000-0000-4000-8000-000000000001";
const certificateId = "70000000-0000-4000-8000-000000000002";
const businessDocument = (days = 7) => ({ id: documentId, restaurant_name: restaurant, location_id: null, name: "Food premises licence", doc_type: "business_license", expiry_date: addDays(btbToday(), days) });

async function enableReminders(request: APIRequestContext): Promise<ReminderSettings> {
  const current = await request.get(endpoint);
  await expect(current).toBeOK();
  const { settings } = await current.json();
  const saved = await request.post(endpoint, { data: { ...settings, enabled: true, manager_emails: ["manager@example.test"], corporate_emails: ["corporate@example.test"] } });
  await expect(saved).toBeOK();
  return (await saved.json()).settings;
}

test("reminder settings retain failed edits and send each due licence to manager and corporate once", async ({ page, fixture }, info) => {
  const due = businessDocument();
  await fixture.configure({ tables: {
    compliance_documents: [due,
      { ...due, id: "70000000-0000-4000-8000-000000000003", name: "Future renewal", expiry_date: addDays(btbToday(), 90) },
      { ...due, id: "70000000-0000-4000-8000-000000000004", name: "No expiry", expiry_date: null },
      { ...due, id: "70000000-0000-4000-8000-000000000005", name: "Site-only licence", location_id: east },
      { ...due, id: "70000000-0000-4000-8000-000000000006", name: "Other restaurant licence", restaurant_name: "Other Restaurant" }],
    btb_staff_licences: [{ id: certificateId, staff_name: "Alexandra Employee", license_type: "food_handler", expiry_date: btbToday() }],
  } });
  await signInBtb(page, "manager", "/between-the-buns/licence-reminders");
  await page.getByLabel("Enable licence-expiry emails").check();
  await page.getByRole("button", { name: "Save reminder settings" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("at least one manager address and one corporate address");
  await page.getByLabel("Manager email addresses").fill("Manager@Example.Test\nmanager@example.test");
  await page.getByLabel("Corporate email addresses").fill("corporate@example.test; manager@example.test");
  await fixture.configure({ failures: [{ table: "btb_notification_settings", method: "PATCH", times: 1 }] });
  await page.getByRole("button", { name: "Save reminder settings" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be saved");
  await expect(page.getByLabel("Manager email addresses")).toHaveValue("Manager@Example.Test\nmanager@example.test");
  expect((await fixture.state()).tables.btb_notification_settings[0].enabled).toBe(false);
  await page.getByRole("button", { name: "Save reminder settings" }).click();
  await expect(page.getByRole("status")).toContainText("Reminder settings saved");
  const settings = (await fixture.state()).tables.btb_notification_settings[0];
  expect(settings.manager_emails).toEqual(["manager@example.test"]);
  expect(settings.corporate_emails).toEqual(["corporate@example.test", "manager@example.test"]);
  const dueTable = page.getByRole("table").first();
  await expect(dueTable.getByRole("row")).toHaveCount(4);
  await expect(dueTable).toContainText("Alexandra Employee · Food handler certificate");
  await expect(dueTable).toContainText("GST Return (tax)");
  await expect(dueTable).not.toContainText(/Future renewal|No expiry|Site-only|Other restaurant|site filing/);
  await expect(dueTable).not.toContainText(/Future renewal|No expiry|Site-only|Other restaurant/);
  await page.getByRole("button", { name: "Send due reminders now" }).click();
  await expect(page.getByRole("status")).toContainText("4 emails accepted by the provider. 0 failed. 0 waiting");
  const state = await fixture.state();
  expect(state.emailDeliveries).toHaveLength(4);
  expect(state.tables.btb_licence_email_log.every((row) => row.status === "sent" && row.attempts === 1 && row.provider_id)).toBeTruthy();
  for (const recipient of ["manager@example.test", "corporate@example.test"]) {
    const sent = state.emailDeliveries.filter((delivery) => delivery.body.to[0] === recipient);
    expect(sent).toHaveLength(2);
    expect(sent.map((delivery) => delivery.body.text).join("\n")).toContain("Business licence / renewal: Food premises licence");
    expect(sent.map((delivery) => delivery.body.text).join("\n")).toContain("Staff certificate: Alexandra Employee · Food handler certificate");
  }
  await page.getByRole("button", { name: "Send due reminders now" }).click();
  await expect(page.getByRole("status")).toContainText("0 emails accepted by the provider");
  expect((await fixture.state()).emailRequests).toHaveLength(4);
  await capture(page, info, "licence-reminders-desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "licence-reminders-mobile");
});

for (const failure of ["reject", "accepted-then-500"] as const) {
  test(`a ${failure} delivery retries with the same provider key and frozen message`, async ({ request, fixture }) => {
    await fixture.configure({ tables: { compliance_documents: [businessDocument()], corporate_dates: [] }, emailFailures: [failure] });
    await apiSignIn(request);
    await enableReminders(request);
    const response = await request.post(endpoint, { data: { action: "run" } });
    await expect(response).toBeOK();
    expect(await response.json()).toMatchObject({ sent: 2, failed: 0, remaining: 0 });
    const state = await fixture.state();
    expect(state.emailRequests).toHaveLength(3);
    expect(state.emailDeliveries).toHaveLength(2);
    const retried = state.tables.btb_licence_email_log.find((row) => row.attempts === 2)!;
    expect(retried).toMatchObject({ status: "sent", recipient: "manager@example.test", delivery_uncertain: false });
    const attempts = state.emailRequests.filter((entry) => entry.key === `btb-licence-${retried.id}`);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].body).toEqual(attempts[1].body);
    const repeated = await request.get(cron, { headers: cronHeaders });
    await expect(repeated).toBeOK();
    expect(await repeated.json()).toMatchObject({ sent: 0, skipped: 2 });
    expect((await fixture.state()).emailRequests).toHaveLength(3);
  });
}

test("simultaneous scheduled and manager dispatches lease each email only once", async ({ request, fixture }) => {
  await fixture.configure({ tables: { compliance_documents: [businessDocument()] } });
  await apiSignIn(request);
  await enableReminders(request);
  const responses = await Promise.all([request.post(endpoint, { data: { action: "run" } }), request.get(cron, { headers: cronHeaders })]);
  for (const response of responses) await expect(response).toBeOK();
  const runs: ReminderRun[] = await Promise.all(responses.map((response) => response.json()));
  expect(runs.reduce((total, run) => total + run.sent, 0)).toBe(2);
  const state = await fixture.state();
  expect(state.emailRequests).toHaveLength(2);
  expect(state.emailDeliveries).toHaveLength(2);
  expect(state.tables.btb_licence_email_log.every((row) => row.status === "sent" && row.attempts === 1)).toBeTruthy();
});

test("persistent provider failures stop after three claims and uncertain old deliveries are not replayed", async ({ request, fixture }) => {
  await fixture.configure({ tables: { compliance_documents: [businessDocument()], corporate_dates: [] }, emailFailures: Array.from({ length: 6 }, () => "reject" as const) });
  await apiSignIn(request);
  await enableReminders(request);
  const failed = await request.post(endpoint, { data: { action: "run" } });
  await expect(failed).toBeOK();
  expect(await failed.json()).toMatchObject({ sent: 0, failed: 2, remaining: 0 });
  const state = await fixture.state();
  expect(state.emailDeliveries).toHaveLength(0);
  expect(state.emailRequests).toHaveLength(6);
  expect(state.tables.btb_licence_email_log.every((row) => row.status === "failed" && row.attempts === 3)).toBeTruthy();
  await expect(await request.get(cron, { headers: cronHeaders })).toBeOK();
  expect((await fixture.state()).emailRequests).toHaveLength(6);
  await fixture.configure({ tables: { btb_licence_email_log: state.tables.btb_licence_email_log.map((row) => ({ ...row, attempts: 1, delivery_uncertain: true, first_attempt_at: new Date(Date.now() - 24 * 3_600_000).toISOString() })) } });
  const expired = await request.post(endpoint, { data: { action: "run" } });
  await expect(expired).toBeOK();
  expect(await expired.json()).toMatchObject({ sent: 0, skipped: 2 });
  expect((await fixture.state()).emailRequests).toHaveLength(6);
});

test("an accepted delivery whose database result fails retains its lease and reuses its frozen payload after recovery", async ({ request, fixture }) => {
  const document = businessDocument();
  await fixture.configure({ tables: { compliance_documents: [document] }, failures: [{ table: "btb_licence_email_log", method: "PATCH", times: 1, match: { status: "eq.sending" } }] });
  await apiSignIn(request);
  await enableReminders(request);
  const lost = await request.post(endpoint, { data: { action: "run" } });
  expect(lost.status()).toBe(503);
  const state = await fixture.state();
  expect(state.emailDeliveries).toHaveLength(1);
  expect(state.tables.btb_licence_email_log[0]).toMatchObject({ status: "sending", attempts: 1, delivery_uncertain: true });
  await fixture.configure({ tables: {
    compliance_documents: [{ ...document, name: "Renewal display name changed" }],
    btb_licence_email_log: state.tables.btb_licence_email_log.map((row) => ({ ...row, lease_until: new Date(Date.now() - 60_000).toISOString() })),
  } });
  const recovered = await request.get(cron, { headers: cronHeaders });
  await expect(recovered).toBeOK();
  expect(await recovered.json()).toMatchObject({ sent: 2, failed: 0 });
  const complete = await fixture.state();
  expect(complete.emailDeliveries).toHaveLength(2);
  expect(complete.emailRequests).toHaveLength(3);
  const original = complete.emailRequests.filter((row) => row.key === state.emailDeliveries[0].key);
  expect(original[0].body).toEqual(original[1].body);
  expect(complete.tables.btb_licence_email_log.every((row) => row.status === "sent")).toBeTruthy();
});

test("reminder administration requires manager or corporate access and cron requires its server secret", async ({ request }) => {
  expect((await request.get(endpoint)).status()).toBe(401);
  expect((await request.get(cron)).status()).toBe(401);
  expect((await request.get(cron, { headers: { Authorization: "Bearer incorrect" } })).status()).toBe(401);
  for (const role of ["staff", "supervisor", "admin"]) {
    await apiSignIn(request, `${role}@btb.demo`);
    expect((await request.get(endpoint)).status(), role).toBe(403);
    expect((await request.post(endpoint, { data: { action: "run" } })).status(), role).toBe(403);
  }
  await apiSignIn(request, "corporate@btb.demo");
  const settings = await enableReminders(request);
  const stale = await request.post(endpoint, { data: { ...settings, version: settings.version - 1 } });
  expect(stale.status()).toBe(409);
  await expect(await request.post(endpoint, { data: { ...settings, enabled: false } })).toBeOK();
  const paused = await request.get(cron, { headers: cronHeaders });
  await expect(paused).toBeOK();
  expect(await paused.json()).toMatchObject({ disabled: true, sent: 0 });
});

test("staff certificates link to an employee, retain failed uploads, download intact and reject stale edits", async ({ page, request, fixture }, info) => {
  await apiSignIn(request);
  const manager = await createEmployee(request, { name: "Morgan Manager", email: "morgan@team.test", role: "manager" });
  const employee = await createEmployee(request);
  await signInEmployee(page, manager.email!, "/between-the-buns/staff-licenses");
  await page.getByRole("button", { name: "Add certificate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add staff certificate" });
  await dialog.getByLabel("Link an employee").selectOption(employee.id);
  await expect(dialog.getByLabel("Employee name", { exact: true })).toHaveValue(employee.name);
  await expect(dialog.getByLabel("Employee name", { exact: true })).toBeDisabled();
  await dialog.getByLabel("Issue date", { exact: true }).fill(addDays(btbToday(), -350));
  await dialog.getByLabel("Expiry date", { exact: true }).fill(addDays(btbToday(), 7));
  await dialog.getByRole("textbox", { name: "Notes", exact: true }).fill("Original qualification certificate.");
  const bytes = Buffer.from("%PDF-1.4\nCertificate download fixture\n%%EOF\n");
  await dialog.getByLabel("Attach certificate", { exact: false }).setInputFiles({ name: "food-handler.pdf", mimeType: "application/pdf", buffer: bytes });
  await fixture.configure({ failures: [{ table: "btb_staff_licences", method: "POST", times: 1 }] });
  await dialog.getByRole("button", { name: "Save certificate" }).click();
  await expect(dialog.getByRole("alert")).toContainText("could not be saved");
  await expect(dialog.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("Original qualification certificate.");
  await dialog.getByRole("button", { name: "Save certificate" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: employee.name, exact: true })).toBeVisible();
  const response = await page.request.get("/api/btb/staff-licences");
  const licence: StaffLicence = (await response.json()).licences[0];
  expect(licence).toMatchObject({ employee_id: employee.id, uploaded_by_name: manager.name, file_size: bytes.length });
  expect(licence).not.toHaveProperty("file_url");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download certificate" }).click()]);
  expect(download.suggestedFilename()).toBe("food-handler.pdf");
  const path = info.outputPath("food-handler.pdf");
  await download.saveAs(path);
  expect(await readFile(path)).toEqual(bytes);
  await page.getByRole("button", { name: `Edit ${employee.name} certificate` }).click();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(licence.notes);
  await expect(await request.post("/api/btb/staff-licences", { data: { ...licence, notes: "Updated on another device.", file: null } })).toBeOK();
  await page.getByRole("dialog").getByRole("textbox", { name: "Notes", exact: true }).fill("Keep this unsaved note.");
  await page.getByRole("dialog").getByRole("button", { name: "Save certificate" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("certificate changed");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("Keep this unsaved note.");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText("Updated on another device.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "staff-certificates-mobile");
  await signInBtb(page, "supervisor", "/between-the-buns/staff-licenses");
  await expect(page.getByRole("button", { name: "Add certificate", exact: true })).toHaveCount(0);
  expect((await page.request.post("/api/btb/staff-licences", { data: { ...licence, notes: "forged" } })).status()).toBe(403);
  expect((await page.request.delete("/api/btb/staff-licences", { data: { id: licence.id, version: 2 } })).status()).toBe(403);
  await expect(await request.get(`/api/btb/staff-licences?download=${licence.id}`)).toBeOK();
  expect((await request.delete("/api/btb/staff-licences", { data: { id: licence.id, version: 1 } })).status()).toBe(409);
  await expect(await request.delete("/api/btb/staff-licences", { data: { id: licence.id, version: 2 } })).toBeOK();
  expect((await request.get(`/api/btb/staff-licences?download=${licence.id}`)).status()).toBe(404);
});
