import { test, expect, capture, signInBtb, signInFoodSafe, east, west } from "./fixtures";
import { parKeys } from "../src/lib/btb-prep-list";
import { cleaningTasks } from "../src/lib/btb-cleaning";
import { btbToday } from "../src/lib/btb-team";
import { ACTIVE_LOCATION_KEY } from "../src/lib/locations";

const today = btbToday();
const item = parKeys[0];
const dateAt = (offset: number) => new Date(new Date(`${today}T12:00:00Z`).getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const prep = (id: string, date = today, name = item) => ({ id, restaurant_name: "Between the Buns", location_id: null, item_name: name, par: 12.5, on_hand: 2.5, pull: 0, urgent: true, count_date: date, created_at: `${date}T16:00:00Z` });

test("prep history reloads saved dates and quantities; same-date loading and saving preserve legacy zeros and scope", async ({ page, fixture }, info) => {
  await fixture.configure({ tables: { prep_counts: [
    { ...prep("today"), location_id: east },
    { ...prep("legacy-zero", today, "Archived item — zero stock"), par: 0, on_hand: 0, urgent: false },
    prep("old", dateAt(-20)),
    { ...prep("other-site", today, "Other site only"), location_id: west },
    { ...prep("other-restaurant", today, "Other restaurant only"), restaurant_name: "Another restaurant" },
  ] } });
  await signInFoodSafe(page, "manager");
  await page.waitForFunction(({ key, id }) => localStorage.getItem(key) === id, { key: ACTIVE_LOCATION_KEY, id: east });
  await signInBtb(page, "manager", "/between-the-buns/prep-list");
  await expect(page.getByLabel(`Par: ${item}`, { exact: true })).toHaveValue("12.5");
  await expect(page.getByLabel(`Urgent: ${item}`, { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "History (2/7)", exact: true }).click();
  const sheet = page.getByRole("article", { name: `Prep sheet ${today}`, exact: true });
  await sheet.getByText("View saved quantities", { exact: true }).click();
  await expect(sheet.getByRole("table")).toContainText("Archived item — zero stock");
  await expect(sheet.getByRole("row", { name: `${item} · Urgent 12.5 2.5 10 0`, exact: true })).toBeVisible();
  await expect(sheet).toContainText("2 saved items");
  await expect(sheet).not.toContainText("Other site only");
  await expect(sheet).not.toContainText("Other restaurant only");
  await capture(page, info, "prep-saved-history-desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "prep-saved-history-mobile");
  await sheet.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save Prep Sheet", exact: true })).toBeEnabled();
  await page.getByLabel(`On hand: ${item}`, { exact: true }).fill("4");
  await page.getByRole("button", { name: "Save Prep Sheet", exact: true }).click();
  await expect(page.getByText(/^Saved \d/)).toBeVisible();
  const rows = (await fixture.state()).tables.prep_counts;
  expect(rows.find((row) => row.item_name === item && row.count_date === today)).toMatchObject({ par: 12.5, on_hand: 4, urgent: true });
  expect(rows.find((row) => row.item_name === "Archived item — zero stock")).toMatchObject({ par: 0, on_hand: 0, pull: 0 });
  expect(rows.some((row) => row.id === "other-site")).toBe(true);
  expect(rows.some((row) => row.id === "other-restaurant")).toBe(true);
  await page.reload();
  await expect(page.getByLabel(`On hand: ${item}`, { exact: true })).toHaveValue("4");
  await expect(page.getByLabel(`Urgent: ${item}`, { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "History (2/7)", exact: true }).click();
  const old = page.getByRole("article", { name: `Prep sheet ${dateAt(-20)}`, exact: true });
  await old.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByLabel("Date:", { exact: true })).toHaveValue(dateAt(-20));
  await expect(page.getByLabel(`On hand: ${item}`, { exact: true })).toHaveValue("2.5");
});

test("the seventh saved prep sheet is complete across database pages, including when it is loaded and saved", async ({ page, fixture }) => {
  const seventh = dateAt(-42);
  const archived = Array.from({ length: 1101 }, (_, index) => prep(`archived-${index}`, seventh, `Archived item ${String(index).padStart(4, "0")}`));
  await fixture.configure({ tables: { prep_counts: [
    ...Array.from({ length: 6 }, (_, index) => prep(`newer-${index}`, dateAt(-index * 7))),
    ...archived,
    { ...prep("duplicate-old", seventh, "Archived item 0000"), par: 1, created_at: `${seventh}T15:00:00Z` },
    prep("eighth", dateAt(-49), "Outside the latest seven"),
  ] } });
  await signInBtb(page, "manager", "/between-the-buns/prep-list");
  await page.getByRole("button", { name: "History (7/7)", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  const sheet = page.getByRole("article", { name: `Prep sheet ${seventh}`, exact: true });
  await expect(sheet).toContainText("1101 saved items");
  await sheet.getByText("View saved quantities", { exact: true }).click();
  await expect(sheet.getByRole("row")).toHaveCount(1102);
  await expect(sheet.getByRole("row", { name: "Archived item 1100 · Urgent 12.5 2.5 10 0", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: `Prep sheet ${dateAt(-49)}`, exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save Prep Sheet", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save Prep Sheet", exact: true }).click();
  await expect(page.getByText(/^Saved \d/)).toBeVisible();
  const saved = (await fixture.state()).tables.prep_counts.filter((row) => row.count_date === seventh && String(row.item_name).startsWith("Archived item"));
  expect(saved).toHaveLength(1101);
  expect(saved.find((row) => row.item_name === "Archived item 0000")).toMatchObject({ par: 12.5, on_hand: 2.5, urgent: true });
  expect(saved.find((row) => row.item_name === "Archived item 1100")).toMatchObject({ par: 12.5, on_hand: 2.5, urgent: true });
});

test("failed prep history and sheet reads offer retry and block saving an incomplete sheet", async ({ page, fixture }) => {
  await fixture.configure({ tables: { prep_counts: [prep("today")] }, failures: [
    { table: "prep_counts", method: "GET", times: 1, match: { select: "*", count_date: null } },
    { table: "prep_counts", method: "GET", times: 1, match: { select: "*", count_date: `eq.${today}` } },
  ] });
  await signInBtb(page, "manager", "/between-the-buns/prep-list");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("This day’s saved prep sheet couldn’t be loaded");
  await expect(page.getByRole("button", { name: "Save Prep Sheet", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^History \(/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Saved prep history couldn’t be loaded" })).toBeVisible();
  await expect(page.getByText("No saved prep sheets yet", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh saved sheets", exact: true }).click();
  await expect(page.getByRole("article", { name: `Prep sheet ${today}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry saved sheet", exact: true }).click();
  await page.getByRole("button", { name: "Today's Prep", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save Prep Sheet", exact: true })).toBeEnabled();
  await expect(page.getByLabel(`Par: ${item}`, { exact: true })).toHaveValue("12.5");
});

test("cleaning history reopens saved names, dates and photos; new entries survive reload", async ({ page, fixture }, info) => {
  const older = dateAt(-14);
  const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1cAAAAASUVORK5CYII=";
  await fixture.configure({ tables: { cleaning_logs: [{ id: "earlier-cleaning", restaurant_name: "Between the Buns", location_id: null, task_name: cleaningTasks[0], done_by: "Taylor", done_date: older, done_time: "09:30", week_start: older, before_photo: JSON.stringify([photo]), after_photo: JSON.stringify([photo]), created_at: `${older}T16:00:00Z` }] } });
  await signInBtb(page, "manager", "/between-the-buns/cleaning-schedule");
  await page.getByRole("button", { name: "History (1)", exact: true }).click();
  await expect(page.getByText("1/11 tasks · 2 photos", { exact: true })).toBeVisible();
  await capture(page, info, "cleaning-saved-history-desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "cleaning-saved-history-mobile");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("Taylor");
  await expect(page.getByLabel("Date", { exact: true }).first()).toHaveValue(older);
  await expect(page.getByLabel("Time", { exact: true }).first()).toHaveValue("09:30");
  await expect(page.getByRole("button", { name: "Zoom before photo 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom after photo 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "This Week", exact: true }).last().click();
  const saved = page.waitForResponse((response) => response.url().includes("/rest/v1/cleaning_logs") && response.request().method() === "POST");
  await page.getByLabel("Name", { exact: true }).first().fill("Morgan");
  expect((await saved).ok()).toBe(true);
  await expect(page.getByLabel("Date", { exact: true }).first()).toHaveValue(today);
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("Morgan");
  await page.getByRole("button", { name: "History (2)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open", exact: true })).toHaveCount(2);
});

test("corporate can review saved prep and cleaning while operational roles keep prep access", async ({ page, fixture }) => {
  await fixture.configure({ tables: { prep_counts: [prep("today")], cleaning_logs: [] } });
  await signInBtb(page, "corporate", "/between-the-buns/prep-list");
  await expect(page.getByLabel(`Par: ${item}`, { exact: true })).toHaveValue("12.5");
  await expect(page.getByLabel(`On hand: ${item}`, { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Save Prep Sheet", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "History (1/7)", exact: true }).click();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByLabel(`On hand: ${item}`, { exact: true })).toHaveValue("2.5");
  await page.goto("/between-the-buns/cleaning-schedule");
  await expect(page.getByLabel("Name", { exact: true }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clear Week", exact: true })).toHaveCount(0);
  for (const role of ["staff", "supervisor"] as const) {
    await signInBtb(page, role, "/between-the-buns/prep-list");
    await expect(page.getByRole("button", { name: "Save Prep Sheet", exact: true })).toBeEnabled();
    await expect(page.getByLabel(`Par: ${item}`, { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByLabel(`On hand: ${item}`, { exact: true })).not.toHaveAttribute("readonly", "");
  }
});
