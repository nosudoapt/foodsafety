import type { Page, TestInfo } from "@playwright/test";
import { test, expect, signInBtb, signInEmployee } from "./fixtures";
import { apiSignIn, createEmployee, restaurant } from "./btb-helpers";
import { btbToday } from "../src/lib/btb-team";
import { canonicalCheckItems } from "../src/lib/btb-operations";
import { addDays, dayLabel, weekDays, weekStart } from "../src/lib/staff-schedule";
import { BROOKS_ORDER_GUIDE } from "../src/lib/brooks-order-guide";

const compactText = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");

async function completeOnePagePdf(page: Page, info: TestInfo, name: string, expected: string[], excluded: string[] = [], landscape = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".btb-print-root")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const path = info.outputPath(`${name}.pdf`);
  const bytes = await page.pdf({ path, format: "Letter", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  await info.attach(name, { path, contentType: "application/pdf" });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await loading.promise;
  try {
    expect(pdf.numPages, "The complete record fits one actual PDF page").toBe(1);
    const sheet = await pdf.getPage(1);
    const viewport = sheet.getViewport({ scale: 1 });
    expect(viewport.width).toBe(landscape ? 792 : 612);
    expect(viewport.height).toBe(landscape ? 612 : 792);
    const content = await sheet.getTextContent();
    const items = content.items.filter((item) => "str" in item);
    const text = compactText(items.map((item) => item.str).join(" "));
    for (const value of expected) expect(text, `PDF includes ${value.slice(0, 100)}`).toContain(compactText(value));
    for (const value of excluded) expect(text, `PDF excludes unsaved/device-only content: ${value}`).not.toContain(compactText(value));
    // Extracted text can exist beyond a clipped PDF edge. Check its coordinates
    // too, so a one-page count alone cannot hide missing bottom/right content.
    for (const item of items.filter((item) => item.str.trim())) {
      const x = item.transform[4];
      const y = item.transform[5];
      expect(x, `${item.str} left edge`).toBeGreaterThanOrEqual(20);
      expect(x + item.width, `${item.str} right edge`).toBeLessThanOrEqual(viewport.width - 20);
      expect(y, `${item.str} bottom edge`).toBeGreaterThanOrEqual(20);
      expect(y + item.height, `${item.str} top edge`).toBeLessThanOrEqual(viewport.height - 20);
    }
  } finally { await loading.destroy(); }
}

test("daily checks print every opening and closing duty, long employee attribution and both full handovers on one Letter page", async ({ page, request }, info) => {
  await apiSignIn(request);
  const opening = await createEmployee(request, { name: "Alexandra Morgan Richardson Singh Longname Opening Employee", email: "opening@team.test" });
  const closing = await createEmployee(request, { name: "Christopher Alexander Macdonald Rutherford Closing Employee", email: "closing@team.test" });
  const today = btbToday();
  const expected = ["Between the Buns · Daily checks", today, opening.name, closing.name, "Saved opening & closing records"];
  for (const [type, employee] of [["opening", opening], ["closing", closing]] as const) {
    const items = canonicalCheckItems(type);
    const notes = Array.from({ length: 130 }, (_, index) => `${type}note${String(index).padStart(3, "0")}`);
    await apiSignIn(request, employee.email!);
    await expect(await request.post("/api/btb/checklists", { data: { date: today, type, version: 0, notes: notes.join(" "), changes: items.map((item) => ({ id: item.id, completed: true })) } })).toBeOK();
    expected.push(...items.map((item) => item.text), ...notes, `Saved by ${employee.name} · version 1`);
  }
  await signInEmployee(page, opening.email!, "/between-the-buns/checklists");
  await page.getByRole("region", { name: "Opening checklist", exact: true }).getByLabel("Handover notes").fill("UNSAVED-HANDOVER-NOT-FOR-PRINT");
  await page.getByRole("button", { name: "Saved history", exact: true }).click();
  await completeOnePagePdf(page, info, "complete-opening-closing", expected, ["UNSAVED-HANDOVER-NOT-FOR-PRINT", "Saved check history", "Sign out"]);
});

test("a full week prints all named opening and closing coverage and employees despite the screen filter", async ({ page, fixture }, info) => {
  const start = weekStart(btbToday());
  const employees = Array.from({ length: 20 }, (_, index) => ({
    id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Team${String(index + 1).padStart(2, "0")} Alexandra Montgomery Richardson Singh Longfamilyname`,
    role: "staff", active: true,
  }));
  const shifts = employees.flatMap((employee, index) => weekDays(start).map((shift_date, day) => ({
    id: `72000000-0000-4000-8000-${String(index * 7 + day + 1).padStart(12, "0")}`,
    employee_id: employee.id, shift_date, start_time: index % 2 ? "18:00" : "08:00", end_time: index % 2 ? "02:00" : "16:00",
    ends_next_day: !!(index % 2), duty: index === 0 ? "opening" : index === 19 ? "closing" : "service", updated_by_name: "Schedule Manager",
  })));
  await fixture.configure({ tables: { btb_employees: employees, btb_shifts: shifts } });
  await signInBtb(page, "manager", "/between-the-buns/staff-schedule");
  await page.getByRole("combobox", { name: "View", exact: true }).selectOption(employees[0].id);
  await expect(page.locator(".schedule-shift")).toHaveCount(7);
  await completeOnePagePdf(page, info, "complete-weekly-schedule", [
    "Between the Buns · Weekly schedule", `${start} – ${addDays(start, 6)}`, "140 shifts · All employees", "Opening staff", "Closing staff",
    ...weekDays(start).map(dayLabel), ...employees.map((employee) => employee.name), "08:00–16:00", "18:00–02:00 (+1 day)",
    "Times use the restaurant’s local time. (+1 day) means the shift ends the following day.",
  ], ["Sign out", "Add shift"], true);
});

test("a large saved order prints every catalog and archived line, full descriptions and saved quantities on one page", async ({ page, request, fixture }, info) => {
  const date = btbToday();
  const archived = { item_name: `Archived-${"X".repeat(230)}`, par: 7, on_hand: 2 };
  await fixture.configure({ tables: { btb_order_sheets: [{ id: "73000000-0000-4000-8000-000000000001", restaurant_name: restaurant, order_date: date, lines: [archived], saved_by_name: "Previous Manager" }] } });
  await apiSignIn(request);
  const catalog = [...new Map(BROOKS_ORDER_GUIDE.flatMap((group) => group.items).map((item) => [item.name, item])).values()];
  expect(catalog.length).toBeGreaterThan(100);
  const lines = [...catalog.map((item, index) => ({ item_name: item.name, par: index + 12, on_hand: index % 5 })), archived];
  const saved = await request.post("/api/btb/orders", { data: { date, version: 1, lines } });
  await expect(saved).toBeOK();
  await signInBtb(page, "supervisor", "/between-the-buns/order-sheet");
  await page.getByRole("searchbox", { name: "Search order items" }).fill(catalog[0].name);
  await page.getByLabel(`PAR for ${catalog[0].name}`, { exact: true }).fill("99999");
  await completeOnePagePdf(page, info, "complete-saved-order", [
    "Between the Buns · Order sheet", `${date} · Version 2 · Manager (shared workspace)`, `${lines.length} recorded items`,
    ...lines.map((line) => line.item_name), "ORDER = PAR − ON HAND, minimum 0. All recorded items are included.",
  ], ["99,999", "99999", "Unsaved draft", "Search order items"]);
});
