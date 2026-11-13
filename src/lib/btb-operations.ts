import { defaultClosingItems, defaultOpeningItems, type ChecklistItem } from "./btb-checklists";
import type { TeamMember } from "./btb-team";
import { isIsoDate } from "./btb-team";

export type ShiftDuty = "service" | "opening" | "closing" | "both" | "prep" | "none";
export const SHIFT_DUTIES: { value: ShiftDuty; label: string }[] = [
  { value: "none", label: "No duty (optional)" }, { value: "opening", label: "Opening" },
  { value: "service", label: "Service" }, { value: "prep", label: "Prep" },
  { value: "closing", label: "Closing" }, { value: "both", label: "Opening & closing" },
];
export interface BtbShift {
  id: string; employee_id: string; shift_date: string; start_time: string; end_time: string;
  ends_next_day: boolean; duty: ShiftDuty; version: number; updated_by_name: string; updated_at: string;
}
export function shiftInterval(shift: Pick<BtbShift, "shift_date" | "start_time" | "end_time" | "ends_next_day">): [number, number] | null {
  if (!isIsoDate(shift.shift_date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start_time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end_time)) return null;
  const start = Date.parse(`${shift.shift_date}T${shift.start_time}:00Z`);
  const end = Date.parse(`${shift.shift_date}T${shift.end_time}:00Z`) + (shift.ends_next_day ? 86_400_000 : 0);
  return end > start && end - start <= 86_400_000 ? [start, end] : null;
}
export function shiftsOverlap(left: BtbShift, right: BtbShift): boolean {
  const a = shiftInterval(left); const b = shiftInterval(right);
  return !!a && !!b && left.employee_id === right.employee_id && left.id !== right.id && a[0] < b[1] && b[0] < a[1];
}
export function dutyNames(shifts: readonly BtbShift[], employees: readonly TeamMember[], duty: "opening" | "closing"): string[] {
  return [...new Set(shifts.filter((shift) => shift.duty === duty || shift.duty === "both").map((shift) => employees.find((employee) => employee.id === shift.employee_id)?.name ?? "Former employee"))];
}

export type CheckType = "opening" | "closing";
export interface AttributedCheckItem extends ChecklistItem {
  completed_by?: string | null; completed_by_name?: string | null; completed_at?: string | null;
}
export interface BtbShiftCheck {
  id: string; check_date: string; check_type: CheckType; items: AttributedCheckItem[];
  done_count: number; total_count: number; completed: boolean; notes: string;
  saved_by_name: string | null; updated_at: string; version: number;
}
export const checkTemplate = (type: CheckType) => type === "opening" ? defaultOpeningItems : defaultClosingItems;
export function canonicalCheckItems(type: CheckType, items: readonly AttributedCheckItem[] = []): AttributedCheckItem[] {
  return checkTemplate(type).map((template) => {
    const saved = items.find((item) => item.id === template.id);
    return { ...template, completed: saved?.completed === true, completed_by: saved?.completed_by ?? null, completed_by_name: saved?.completed_by_name ?? null, completed_at: saved?.completed_at ?? null };
  });
}
export const checklistStaff = (items: readonly AttributedCheckItem[]): string[] => [...new Set(items.filter((item) => item.completed).map((item) => item.completed_by_name ?? "Staff not recorded"))];

export interface OrderLine { item_name: string; par: number; on_hand: number }
export interface BtbOrder {
  id: string; order_date: string; lines: OrderLine[]; version: number;
  saved_by_name: string; saved_at: string;
}
export interface BtbOrderRevision { id: string; sheet_id: string; order_date: string; lines: OrderLine[]; version: number; saved_by_name: string; saved_at: string }
export const orderQuantity = (line: OrderLine): number => Math.max(0, line.par - line.on_hand);
export const orderTotal = (lines: readonly OrderLine[]): number => lines.reduce((total, line) => total + orderQuantity(line), 0);
export function validOrderLines(input: unknown): input is OrderLine[] {
  if (!Array.isArray(input) || input.length > 500) return false;
  const names = new Set<string>();
  return input.every((line) => {
    if (!line || typeof line.item_name !== "string" || !line.item_name.trim() || line.item_name.length > 250 || names.has(line.item_name)) return false;
    names.add(line.item_name);
    return [line.par, line.on_hand].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000);
  });
}
