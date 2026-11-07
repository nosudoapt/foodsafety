import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistLines, fixText, limitLabel, pdfText, verdict } from "../src/lib/btb-daily-report";
import type { DailyReportData } from "../src/lib/btb-daily-report";

test("pdfText folds typographic characters to printable ASCII", () => {
  assert.equal(pdfText("Opening — shift \u2019today\u201d… 12\u00B0C"), "Opening - shift 'today\"... 12?C");
  assert.equal(pdfText("Ten \u2264 12 \u2192 In range \u2265 10"), "Ten <= 12 -> In range >= 10");
  assert.equal(pdfText("emoji \u2764 and \u00A0 nbsp"), "emoji ? and nbsp");
  assert.equal(pdfText(1 as unknown as string), "1");
  assert.equal(pdfText(null as unknown as string), "");
  for (const character of pdfText("Anything \u2022 5 mL \u00D7 3")) {
    assert.ok(character >= " " && character <= "~", "every fold must be printable ASCII");
  }
});

test("pdfText collapses whitespace", () => {
  assert.equal(pdfText(" a\n b\t c "), "a b c");
  assert.equal(pdfText("   "), "");
});

test("fixText keeps a real zero but marks missing values", () => {
  assert.equal(fixText(0), "0.0");
  assert.equal(fixText(""), "Missing");
  assert.equal(fixText(null), "Missing");
  assert.equal(fixText(undefined), "Missing");
  assert.equal(fixText(4.25), "4.3");
  assert.equal(fixText("n/a"), "n/a");
});

test("limitLabel never invents an approved range", () => {
  assert.equal(limitLabel(null, null), "No approved limit set");
  assert.equal(limitLabel(0, 5), "0.0 to 5.0");
  assert.equal(limitLabel(null, 4), "<= 4.0");
  assert.equal(limitLabel(-18, null), ">= -18.0");
});

test("verdict honours the saved verdict first", () => {
  assert.equal(verdict(false, 4, 0, 5), "OUT OF RANGE");
  assert.equal(verdict(true, 40, 0, 5), "In range");
  // No saved verdict, bounds exist: recompute from the bounds.
  assert.equal(verdict(null, 4, 0, 5), "In range (no saved verdict)");
  assert.equal(verdict(null, 6, 0, 5), "OUT OF RANGE (no saved verdict)");
  // No bounds either: say so instead of guessing safe.
  assert.equal(verdict(null, 6, null, null), "No approved limit set");
  assert.equal(verdict(null, null, null, null), "No reading");
});

test("checklistLines reports absent sheets as not saved, not zero", () => {
  const data: DailyReportData = {
    checklists: [{ check_type: "opening", items: [{ id: "1", text: "Floors", completed: true }], done_count: 1, total_count: 2, completed: false, notes: "Lights flicker", saved_by_name: "Aman" }],
    templates: [
      { kind: "opening", version: 3, tasks: [{ id: "1", text: "Floors" }, { id: "2", text: "Grill scrape" }] },
      { kind: "closing", version: 2, tasks: [{ id: "9", text: "Lock up" }] },
    ],
  };
  const lines = checklistLines(data);
  const opening = lines.find((row) => row.kind === "opening")!;
  assert.equal(opening.present, true);
  assert.equal(opening.done, 1);
  assert.deepEqual(opening.missing, ["Grill scrape"]);
  assert.equal(opening.notes, "Lights flicker");
  const closing = lines.find((row) => row.kind === "closing")!;
  assert.equal(closing.present, false);
  assert.deepEqual(closing.missing, ["Lock up"]);
  const cleaning = lines.find((row) => row.kind === "cleaning")!;
  assert.equal(cleaning.present, false);
  assert.deepEqual(cleaning.missing, []);
});

test("checklistLines treats full completion without a saved flag as complete", () => {
  const lines = checklistLines({
    checklists: [{ check_type: "cleaning", items: [{ id: "1", text: "A" }, { id: "2", text: "B" }], done_count: 2, total_count: 2 }],
    templates: [{ kind: "cleaning", version: 1, tasks: [{ id: "1", text: "A" }, { id: "2", text: "B" }] }],
  });
  assert.equal(lines.find((row) => row.kind === "cleaning")!.completed, true);
});

test("verify the daily PDF renders and stays a valid document", { skip: process.env.REPORT_PDF_E2E !== "1" ? "run with REPORT_PDF_E2E=1 and --conditions=react-server" : false }, async () => {
  const { renderDailyReportPdf } = await import("../src/lib/btb-daily-pdf");
  const bytes = await renderDailyReportPdf(
    {
      location: "Ancoats",
      business_date: "2026-11-06",
      timezone: "America/Edmonton",
      checklists: [{ check_type: "opening", items: [], done_count: 0, total_count: 0, notes: "Quiet day", saved_by_name: "Priya" }],
      temperatures: [
        { equipment_name: "Walk-in cooler", slot: "11:00", temperature: 3.5, min_safe_temp: 0, max_safe_temp: 4, is_safe: true },
        { equipment_name: "Freezer", slot: "16:00", temperature: 12, min_safe_temp: null, max_safe_temp: -18, is_safe: false },
      ],
      sanitizer: [{ slot: "11:00", ppm: 0, min_ppm: 200, max_ppm: 400, is_safe: true }],
    },
    { location: "Ancoats", businessDate: "2026-11-06", timezone: "America/Edmonton", generatedAt: "2026-11-07T09:00:00Z" },
  );
  const head = Buffer.from(bytes.slice(0, 8)).toString("latin1");
  assert.ok(head.startsWith("%PDF-1."), "pdf-lib must emit a PDF header");
  assert.ok(bytes.length > 1200, "a real report is never an empty shell");
});
