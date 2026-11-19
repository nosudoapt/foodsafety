import { test, expect, capture, east } from "./fixtures";
import { consoleSites, signInConsole } from "./btb-console-fixtures";

test("invitation receipts expose a transient manual link only when the sender is missing", async ({ page, fixture }, info) => {
  const missingSender = process.env.BTB_TEST_EMAIL_MODE === "missing-sender";
  const missingScheduler = process.env.BTB_TEST_EMAIL_MODE === "missing-scheduler";
  await fixture.configure({ tables: consoleSites });
  await signInConsole(page, `/btb/admin/locations/${east}`);
  await page.getByRole("button", { name: "Invite person", exact: true }).click();
  await page.getByLabel("Person’s name").fill("Morgan Employee");
  await page.getByLabel("Employee email").fill("morgan@workspace.test");
  await page.getByRole("button", { name: "Create invitation", exact: true }).click();
  await expect(page.getByRole("heading", { name: missingSender ? "Invitation created · manual link" : "Invitation queued", exact: true })).toBeVisible();
  const state = await fixture.state();
  const job = state.tables.btb_email_jobs.find(row => row.kind === "invite")!;
  const link = (job.body as string).match(/https?:\/\/[^\s]+\/btb\/login\/set-password\?token=[a-f0-9]{64}/)![0];
  if (missingSender) await expect(page.getByLabel("Private setup link")).toHaveValue(link);
  else await expect(page.getByLabel("Private setup link")).toHaveCount(0);
  if (missingScheduler) await expect(page.getByText("Configure the scheduler before expecting email delivery.", { exact: false })).toBeVisible();
  const people = await page.request.get(`/api/btb/admin/locations/${east}/people`);
  expect(await people.text()).not.toMatch(/token_hash|password_hash|set-password\?token=/);
  expect(JSON.stringify(state.tables.btb_events)).not.toContain(link);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(link);
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(page, info, `console-invitation-${missingSender ? "manual" : "queued"}-${width}`);
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Morgan Employee", exact: true })).toBeVisible();
  await expect(page.getByLabel("Private setup link")).toHaveCount(0);
  await page.goto(link);
  await expect(page.getByText("morgan@workspace.test", { exact: true })).toBeVisible();
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(page, info, `console-password-setup-${width}`);
  }
});
