import { isUuid } from "./btb-team";

export const TEMPERATURE_TYPES = [
  { value: "cold_storage", label: "Cold storage" },
  { value: "cooking", label: "Cooking" },
  { value: "cooling", label: "Cooling" },
  { value: "hot_holding", label: "Hot holding" },
  { value: "reheating", label: "Reheating" },
  { value: "probe_calibration", label: "Probe calibration" },
] as const;
export type TemperatureType = typeof TEMPERATURE_TYPES[number]["value"];

export interface TemperatureInput {
  id: string;
  record_type: TemperatureType;
  equipment_name: string;
  food_item: string;
  temperature: number;
  min_safe_temp: number;
  max_safe_temp: number;
  notes: string;
}

export interface BtbTemperatureRecord extends TemperatureInput {
  // "PPM" occurs for sanitizer rows saved from the daily sheet; the table's
  // unit column is free text and the sheet records sanitizer strength honestly.
  unit: "C" | "PPM";
  is_safe: boolean;
  recorded_at: string;
  business_date?: string | null;
  slot?: string | null;
}

// Match the existing temperature_records DECIMAL(5,2), while rejecting blanks,
// booleans, non-finite values and values below absolute zero before persistence.
function celsius(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?\d+(\.\d{1,2})?$/.test(value.trim()))) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < -273.15 || number > 999.99 || Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) return null;
  return number;
}

export function parseTemperature(input: Record<string, unknown>): { value: TemperatureInput; error?: never } | { error: string; value?: never } {
  if (!isUuid(input.id)) return { error: "Start a new temperature reading and try again." };
  if (!TEMPERATURE_TYPES.some((type) => type.value === input.record_type)) return { error: "Choose a record type." };
  for (const [key, label] of [["equipment_name", "equipment"], ["food_item", "a food or storage item"]] as const) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 150) return { error: `Enter ${label} (up to 150 characters).` };
  }
  const temperature = celsius(input.temperature), min = celsius(input.min_safe_temp), max = celsius(input.max_safe_temp);
  if (temperature === null) return { error: "Enter a temperature between −273.15 and 999.99°C, with at most two decimal places." };
  if (min === null || max === null || min > max) return { error: "Enter a valid target range. The minimum must not exceed the maximum." };
  if (typeof input.notes !== "string" || input.notes.length > 2000) return { error: "Keep notes under 2,000 characters." };
  return { value: {
    id: input.id.toLowerCase(), record_type: input.record_type as TemperatureType,
    equipment_name: (input.equipment_name as string).trim(), food_item: (input.food_item as string).trim(),
    temperature, min_safe_temp: min, max_safe_temp: max, notes: input.notes.trim(),
  } };
}

export function temperatureInRange(temperature: number, min: number, max: number): boolean {
  return temperature >= min && temperature <= max;
}

// --- Daily sheet (printed-form replica) -------------------------------------

/** The three scheduled check times on the printed sheet. Values match the
 * platform's equipment slot convention ("11:00"/"16:00"/"20:00"). */
export const TEMPERATURE_SHEET_SLOTS = ["11:00", "16:00", "20:00"] as const;
export type TemperatureSheetSlot = typeof TEMPERATURE_SHEET_SLOTS[number];

export const TEMPERATURE_SHEET_SLOT_LABELS: Record<TemperatureSheetSlot, string> = {
  "11:00": "11:00 AM", "16:00": "4:00 PM", "20:00": "8:00 PM",
};

type TemperatureSheetKind = "freezer" | "cooler" | "sanitizer" | "blank";

/** Row labels in the printed sheet's exact order. Blank rows stay on the form
 * for handwriting, so the web copy keeps them as visual-only rows. */
export const TEMPERATURE_SHEET_ROWS: readonly { label: string; kind: TemperatureSheetKind }[] = [
  { label: "FREEZER-1", kind: "freezer" },
  { label: "FREEZER-2", kind: "freezer" },
  { label: "FREEZER-3", kind: "freezer" },
  { label: "FREEZER-4", kind: "freezer" },
  { label: "FREEZER-5", kind: "freezer" },
  { label: "COOLER-1", kind: "cooler" },
  { label: "COOLER-2", kind: "cooler" },
  { label: "COOLER-3", kind: "cooler" },
  { label: "LINE COOLER", kind: "cooler" },
  { label: "CHEF BASE DRAWER", kind: "cooler" },
  { label: "", kind: "blank" },
  { label: "", kind: "blank" },
  { label: "SANTIZER", kind: "sanitizer" },
  { label: "", kind: "blank" },
];

/** The restaurant's standing standards, pre-printed on the form. Frozen storage
 * holds −24 to −18 °C, refrigeration 0 to 4 °C, and the Quat sanitizer bucket
 * 200 to 400 PPM (matching the seeded Grill House equipment settings). */
export const TEMPERATURE_SHEET_RANGES: Record<Exclude<TemperatureSheetKind, "blank">, { min: number; max: number; unit: "C" | "PPM"; record_type: TemperatureType | "sanitizer" }> = {
  freezer: { min: -24, max: -18, unit: "C", record_type: "cold_storage" },
  cooler: { min: 0, max: 4, unit: "C", record_type: "cold_storage" },
  sanitizer: { min: 200, max: 400, unit: "PPM", record_type: "sanitizer" },
};

/** Every sheet row that accepts an entry, with its standard range. */
export const TEMPERATURE_SHEET_FILLABLE = TEMPERATURE_SHEET_ROWS
  .map((row, index) => ({ ...row, index }))
  .filter((row): row is { label: string; kind: Exclude<TemperatureSheetKind, "blank">; index: number } => row.kind !== "blank");

export interface TemperatureSheetCell { label: string; slot: TemperatureSheetSlot; value: number }
export interface TemperatureSheetEntry {
  date: string;
  cells: (TemperatureSheetCell & { unit: "C" | "PPM"; min_safe_temp: number; max_safe_temp: number; record_type: TemperatureType | "sanitizer" })[];
}

// Same DECIMAL(5,2) bounds as celsius(); sanitizer PPM just never goes below 0.
function sheetValue(value: unknown, floor: number): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?\d+(\.\d{1,2})?$/.test(value.trim()))) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < floor || number > 999.99 || Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) return null;
  return number;
}

/** Validates one day's sheet: a real date (no future days) and only filled
 * cells, which arrive as label + slot + reading. Empty boxes are simply
 * absent — a blank on the paper form is never stored as a zero. */
export function parseTemperatureSheet(input: Record<string, unknown>, today: string): { value: TemperatureSheetEntry; error?: never } | { error: string; value?: never } {
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Choose the date on the sheet." };
  if (input.date > today) return { error: "The sheet can’t be dated in the future." };
  if (!Array.isArray(input.cells) || !input.cells.length) return { error: "Write at least one reading on the sheet before saving." };
  if (input.cells.length > 42) return { error: "A sheet holds 42 readings (14 rows × 3 times). Save the page and start a new sheet." };
  const cells: TemperatureSheetEntry["cells"] = [];
  const seen = new Set<string>();
  for (const raw of input.cells) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "One of the sheet entries could not be read. Try again." };
    const cell = raw as Record<string, unknown>;
    const row = TEMPERATURE_SHEET_FILLABLE.find((candidate) => candidate.label === cell.label);
    if (!row) return { error: `“${String(cell.label ?? "")}” is not a labelled row on the sheet.` };
    if (!TEMPERATURE_SHEET_SLOTS.some((slot) => slot === cell.slot)) return { error: `“${row.label}” needs one of the three scheduled times.` };
    const key = `${row.label}|${String(cell.slot)}`;
    if (seen.has(key)) return { error: `${row.label} was entered twice for the same time. Keep one reading per box.` };
    seen.add(key);
    const range = TEMPERATURE_SHEET_RANGES[row.kind];
    const value = row.kind === "sanitizer" ? sheetValue(cell.value, 0) : celsius(cell.value);
    if (value === null) {
      return { error: row.kind === "sanitizer"
        ? `${row.label}: enter a sanitizer strength between 0 and 999.99 PPM.`
        : `${row.label}: enter a temperature between −273.15 and 999.99 °C.` };
    }
    cells.push({ label: row.label, slot: cell.slot as TemperatureSheetSlot, value, unit: range.unit, min_safe_temp: range.min, max_safe_temp: range.max, record_type: range.record_type });
  }
  cells.sort((a, b) => a.label.localeCompare(b.label) || TEMPERATURE_SHEET_SLOTS.indexOf(a.slot) - TEMPERATURE_SHEET_SLOTS.indexOf(b.slot));
  return { value: { date: input.date, cells } };
}
