import { isIsoDate } from "./btb-team";

export const STAFF_LICENCE_TYPES = [
  { value: "food_handler", label: "Food handler certificate" },
  { value: "first_aid", label: "First aid certificate" },
  { value: "whmis", label: "WHMIS certification" },
  { value: "other", label: "Other licence or certificate" },
] as const;
export const licenceTypeLabel = (type: string) => STAFF_LICENCE_TYPES.find((item) => item.value === type)?.label ?? type;
export interface StaffLicence {
  id: string; employee_id: string | null; staff_name: string; license_type: string;
  file_name: string | null; file_size: number | null; issue_date: string | null; expiry_date: string | null;
  notes: string; uploaded_by_name: string | null; version: number; created_at: string;
}
export function daysUntilExpiry(expiry: string, today: string): number | null {
  if (!isIsoDate(expiry) || !isIsoDate(today)) return null;
  return Math.round((Date.parse(`${expiry}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
export function licenceExpiryLabel(expiry: string | null, today: string): string {
  const days = expiry ? daysUntilExpiry(expiry, today) : null;
  return days === null ? "No expiry recorded" : days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "Expires today" : `Expires in ${days} days`;
}
