import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Server-side renderer for the combined daily operations PDF.
 *
 * WHY ASCII ONLY: pdf-lib's built-in Helvetica is WinAnsi-encoded, and one
 * unsupported glyph (a typographic dash, an emoji, a degree sign typed as a
 * symbol) throws and loses the whole report. Every string is folded to
 * printable ASCII here. Losing a decorative dash is acceptable; losing a
 * legal operations record is not.
 */


const A4: [number, number] = [595.28, 841.89];
const MARGIN = 46;
const BODY = 9.5;
const LINE = 13.5;
const WIDTH = A4[0] - MARGIN * 2;
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.84, 0.83, 0.86);

interface SheetMeta {
  location: string;
  businessDate: string;
  timezone: string;
  generatedAt: string;
}

/**
 * A very small paginated text layout. pdf-lib has no layout engine, so this
 * owns the cursor, breaks lines at word boundaries and starts a new page before
 * a line would cross the bottom margin. Nothing is silently clipped.
 */
class Sheet {
  private readonly pages: PDFPage[] = [];
  private page: PDFPage;
  private y = 0;
  private readonly meta: SheetMeta;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    meta: SheetMeta,
  ) {
    this.meta = meta;
    this.page = doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - MARGIN;
  }

  static async create(meta: SheetMeta): Promise<Sheet> {
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return new Sheet(doc, regular, bold, meta);
  }

  private newPage(): void {
    const page = this.doc.addPage(A4);
    this.pages.push(page);
    this.page = page;
    this.y = A4[1] - MARGIN;
    this.rule();
    this.text("Combined daily operations report (continued)", BODY, MUTED, this.regular);
    this.space(6);
    this.text(`${this.meta.location} - ${this.meta.businessDate}`, BODY, MUTED, this.bold);
    this.space(10);
  }

  /** Break a string into lines that fit the body width. */
  private wrap(value: string, size = BODY, font = this.regular): string[] {
    const text = pdfText(value);
    if (!text) return [];
    const limit = WIDTH;
    const out: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= limit) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // A single word longer than the page must be split, not overflow.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > limit) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > limit) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) out.push(line);
    return out;
  }

  space(points: number): void {
    this.y -= points;
    if (this.y < MARGIN) this.newPage();
  }

  private rule(): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + WIDTH, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
  }

  /** Draw wrapped visitor text at the cursor and advance it. */
  text(value: string, size = BODY, color = INK, font = this.regular, indent = 0): void {
    this.draw(value, size, color, font, indent);
  }

  heading(value: string): void {
    this.space(10);
    this.draw(pdfText(value), 12.5, INK, this.bold, 0);
    this.space(2);
    this.rule();
    this.space(8);
  }

  /** Draw wrapped text at the cursor and advance it. */
  private draw(value: string, size: number, color: typeof INK, font: PDFFont, indent: number): void {
    const lines = this.wrap(value, size, font);
    if (!lines.length) { this.y -= size * 0.6; return; }
    for (const line of lines) {
      this.y -= LINE;
      if (this.y - size < MARGIN) { this.newPage(); this.y -= LINE; }
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font, color });
    }
  }

  /** Bulleted line: the bullet is drawn even when the text wraps. */
  bullet(value: string, symbol = "-"): void {
    this.space(2);
    const bullet = pdfText(symbol);
    this.y -= LINE;
    const lines = this.wrap(value);
    for (let i = 0; i < lines.length; i++) {
      if (this.y - BODY < MARGIN) { this.newPage(); this.y -= LINE; }
      const prefix = i === 0 ? `${bullet} ` : "  ";
      this.page.drawText(prefix + lines[i], { x: MARGIN, y: this.y, size: BODY, font: this.regular, color: INK });
      this.y -= LINE;
      for (const rest of lines.slice(i + 1)) {
        if (this.y - BODY < MARGIN) { this.newPage(); this.y -= LINE; }
        this.page.drawText("  " + rest, { x: MARGIN, y: this.y, size: BODY, font: this.regular, color: INK });
        this.y -= LINE;
      }
      return;
    }
  }

  /** Left label, right value, always on one line (values are pre-truncated). */
  key(label: string, value: string, indent = 0): void {
    const left = pdfText(label);
    const right = pdfText(value);
    this.y -= LINE;
    if (this.y - BODY < MARGIN) { this.newPage(); this.y -= LINE; }
    this.page.drawText(left, { x: MARGIN + indent, y: this.y, size: BODY, font: this.regular, color: MUTED });
    const lw = this.regular.widthOfTextAtSize(left, BODY);
    let shown = right;
    while (shown.length > 1 && this.bold.widthOfTextAtSize(shown, BODY) > WIDTH - indent - lw - 8) shown = shown.slice(0, -1);
    const rw = this.bold.widthOfTextAtSize(shown, BODY);
    this.page.drawText(shown, { x: MARGIN + WIDTH - rw, y: this.y, size: BODY, font: this.bold, color: INK });
  }

  /** Stamp page x-of-y on every page; done last so the page count is known. */
  private footers(): void {
    const label = pdfText(`${this.meta.location} - ${this.meta.businessDate} - Page`);
    for (let i = 0; i < this.pages.length; i++) {
      this.pages[i].drawText(`${label} ${i + 1} of ${this.pages.length}`, {
        x: MARGIN, y: MARGIN - 18, size: 8, font: this.regular, color: MUTED,
      });
      this.pages[i].drawText(pdfText(`Rendered ${this.meta.generatedAt}`), {
        x: MARGIN, y: MARGIN - 29, size: 8, font: this.regular, color: MUTED,
      });
    }
  }

  headFont(): PDFFont { return this.bold; }
  bodyFont(): PDFFont { return this.regular; }

  async finish(): Promise<Uint8Array> {
    this.footers();
    return this.doc.save();
  }
}

import { checklistLines, fixText, limitLabel, numSafe, pdfText, verdict, type DailyReportData } from "./btb-daily-report";





export interface DailyReportMeta {
  location: string;
  businessDate: string;
  timezone: string;
  generatedAt: string;
}

/**
 * Render the combined daily PDF: letterhead, checklist coverage, Celsius
 * temperatures, then sanitizer PPM. Any record with a missing value renders
 * "Missing" - a gap is never rendered as 0.0.
 */
export async function renderDailyReportPdf(data: DailyReportData, meta: DailyReportMeta): Promise<Uint8Array> {
  const sheet = await Sheet.create({
    location: meta.location,
    businessDate: meta.businessDate,
    timezone: meta.timezone,
    generatedAt: meta.generatedAt,
  });

  sheet.text(`${meta.location} - daily operations`, 16, INK, sheet.headFont());
  sheet.space(4);
  sheet.text(`Business date ${meta.businessDate} (${meta.timezone})`, 10.5, MUTED, sheet.bodyFont());
  sheet.space(3);
  sheet.text(`Rendered ${meta.generatedAt}`, 8.5, MUTED, sheet.bodyFont());
  sheet.space(10);

  sheet.heading("Checklists");
  for (const line of checklistLines(data)) {
    const status = !line.present ? "NOT SAVED" : line.completed ? "Complete" : `${line.done}/${line.total} done`;
    sheet.bullet(`${line.label}: ${status}${line.savedBy ? ` - saved by ${line.savedBy}` : ""}`);
    if (line.notes) sheet.text(`   Notes: ${line.notes}`, 9, MUTED);
    for (const missed of line.missing) sheet.text(`   Outstanding: ${missed}`, 9, MUTED);
  }

  sheet.heading("Temperatures (Celsius)");
  const temperatureRows = (data.temperatures ?? []).filter((row) =>
    row.equipment_name || row.slot || row.temperature !== null && row.temperature !== undefined);
  if (!temperatureRows.length) sheet.bullet("No temperature readings saved.");
  for (const row of temperatureRows) sheet.bullet(`${row.equipment_name || "Unknown equipment"} ${row.slot ? `@ ${row.slot}` : ""}: ${fixText(row.temperature)} C - ${verdict(row.is_safe ?? null, numSafe(row.temperature), row.min_safe_temp, row.max_safe_temp)} - limit ${limitLabel(row.min_safe_temp, row.max_safe_temp)}${row.recorded_by_name ? ` - ${row.recorded_by_name}` : ""}`);

  sheet.heading("Sanitizer (ppm)");
  const sanitizerRows = data.sanitizer ?? [];
  if (!sanitizerRows.length) sheet.bullet("No sanitizer readings saved.");
  for (const row of sanitizerRows) sheet.bullet(`${row.slot || "Unknown slot"}: ${fixText(row.ppm)} ppm - ${verdict(row.is_safe ?? null, numSafe(row.ppm), row.min_ppm, row.max_ppm)} - limit ${limitLabel(row.min_ppm, row.max_ppm)}`);

  return sheet.finish();
}
