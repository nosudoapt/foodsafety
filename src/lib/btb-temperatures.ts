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
  unit: "C";
  is_safe: boolean;
  recorded_at: string;
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
