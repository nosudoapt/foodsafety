// Pure, secret-free helpers for the combined daily operations report.
// Imported by the PDF renderer, the email worker, the reports screen and the
// tests, so this module must stay free of server-only imports.

export interface ReportCheckItem {
  id?: string | null;
  text?: string | null;
  completed?: boolean | null;
  evidence_id?: string | null;
  assigned_to?: string | null;
}

export interface ReportCheck {
  check_type?: string | null;
  items?: ReportCheckItem[] | null;
  done_count?: number | null;
  total_count?: number | null;
  completed?: boolean | null;
  notes?: string | null;
  saved_by_name?: string | null;
  updated_at?: string | null;
}

export interface ReportTemplate {
  kind?: string | null;
  version?: number | null;
  tasks?: { id?: string | null; text?: string | null; requires_photo?: boolean | null }[] | null;
}

export interface ReportEquipment {
  id?: string | null;
  name?: string | null;
  slots?: string[] | null;
}

export interface ReportTemperature {
  equipment_id?: string | null;
  equipment_name?: string | null;
  slot?: string | null;
  temperature?: number | string | null;
  unit?: string | null;
  min_safe_temp?: number | null;
  max_safe_temp?: number | null;
  is_safe?: boolean | null;
  recorded_by_name?: string | null;
  notes?: string | null;
}

export interface ReportSanitizer {
  slot?: string | null;
  ppm?: number | string | null;
  min_ppm?: number | null;
  max_ppm?: number | null;
  is_safe?: boolean | null;
  recorded_by_name?: string | null;
  notes?: string | null;
}

export interface DailyReportData {
  location_id?: string | null;
  location?: string | null;
  business_date?: string | null;
  timezone?: string | null;
  checklists?: ReportCheck[] | null;
  templates?: ReportTemplate[] | null;
  equipment?: ReportEquipment[] | null;
  temperatures?: ReportTemperature[] | null;
  sanitizer?: ReportSanitizer[] | null;
  sanitizer_slots?: string[] | null;
}
export const REPORT_CHECK_KINDS = ["opening", "closing", "cleaning"] as const;
export type ReportCheckKind = (typeof REPORT_CHECK_KINDS)[number];

export const REPORT_CHECK_LABEL: Record<ReportCheckKind, string> = {
  opening: "Opening",
  closing: "Closing",
  cleaning: "Cleaning",
};

/** One checklist row as it appears in the report, including missing templates. */
export interface ChecklistLine {
  kind: ReportCheckKind;
  label: string;
  present: boolean;
  done: number;
  total: number;
  completed: boolean;
  savedBy: string;
  notes: string;
  missing: string[];
}

/**
 * Resolve each checklist kind against the snapshot, never against the
 * template alone: it is the absence of both that the client must see.
 */
export function checklistLines(data: DailyReportData): ChecklistLine[] {
  return REPORT_CHECK_KINDS.map((kind) => {
    const check = (data.checklists ?? []).find((row) => row.check_type === kind) ?? null;
    const template = (data.templates ?? []).find((row) => row.kind === kind) ?? null;
    const tasks = template?.tasks ?? [];
    const items = check?.items ?? [];
    const missing = tasks
      .filter((task) => {
        if (!task.id) return false;
        const saved = items.find((item) => item.id === task.id);
        return !saved || !saved.completed;
      })
      .map((task) => String(task.text ?? task.id ?? "").trim())
      .filter(Boolean);
    const done = check?.done_count ?? items.filter((item) => item.completed).length;
    const total = check?.total_count ?? tasks.length;
    return {
      kind,
      label: REPORT_CHECK_LABEL[kind],
      present: !!check,
      done,
      total,
      completed: !!check?.completed || (total > 0 && done === total),
      savedBy: String(check?.saved_by_name ?? "").trim(),
      notes: String(check?.notes ?? "").trim(),
      missing: check ? missing : tasks.map((task) => String(task.text ?? task.id ?? "").trim()).filter(Boolean),
    };
  });
}

/**
 * Fold text to printable ASCII. pdf-lib's Helvetica is WinAnsi: one
 * unsupported glyph throws and loses the whole PDF, so decorative unicode is
 * deliberately sacrificed. Shared with the renderer and the tests.
 */
export function pdfText(value: unknown): string {
  // Collapse whitespace first so newlines never become literal "?" markers.
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00B7\u2022\u25CF]/g, "-")
    .replace(/\u00D7/g, "x")
    .replace(/\u00F7/g, "/")
    .replace(/\u2260/g, "!=")
    .replace(/[\u21D2\u2192]/g, "->")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/[^\x20-\x7E]/g, "?")
    .trim();
}

/** A real 0 renders "0.0"; a blank, null or unknown reading renders Missing. */
export function fixText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Missing";
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return pdfText(String(value));
  return n.toFixed(1);
}

/** Never invent a limit: with no approved range we say so. */
export function limitLabel(min: unknown, max: unknown): string {
  const lo = typeof min === "number" && Number.isFinite(min) ? (min as number) : null;
  const hi = typeof max === "number" && Number.isFinite(max) ? (max as number) : null;
  if (lo === null && hi === null) return "No approved limit set";
  if (lo === null) return `<= ${hi!.toFixed(1)}`;
  if (hi === null) return `>= ${lo.toFixed(1)}`;
  return `${lo.toFixed(1)} to ${hi.toFixed(1)}`;
}

/**
 * The saved verdict wins; without one we re-check the bounds, and with no
 * bounds at all we say so instead of guessing safe.
 */
export function verdict(
  isSafe: boolean | null | undefined,
  value: number | null,
  min: unknown,
  max: unknown,
): string {
  if (typeof isSafe === "boolean") return isSafe ? "In range" : "OUT OF RANGE";
  if (value === null) return "No reading";
  const lo = typeof min === "number" && Number.isFinite(min) ? (min as number) : null;
  const hi = typeof max === "number" && Number.isFinite(max) ? (max as number) : null;
  if (lo === null && hi === null) return "No approved limit set";
  const ok = (lo === null || value >= lo) && (hi === null || value <= hi);
  return ok ? "In range (no saved verdict)" : "OUT OF RANGE (no saved verdict)";
}

/** A finite number or null - strings that fail to parse stay null. */
export function numSafe(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
