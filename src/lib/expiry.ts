// Central expiry / renewal engine — the compliance USP.
// Every document type carries a `notifyDays` lead time (client requirement:
// 2-month for licenses/insurance/hood/fire, 3-month franchise, 6-month lease).
// One function turns an expiry date into a status the whole app renders the same way.

export type ExpiryLevel = "expired" | "critical" | "warning" | "ok" | "none";

export interface ComplianceType {
  value: string;
  label: string;
  icon: string;      // emoji for compact chips
  notifyDays: number; // lead time before expiry to start warning
}

// Single source of truth for every expiring document the client listed.
export const COMPLIANCE_TYPES: ComplianceType[] = [
  { value: "health_license",    label: "Health / Food Safety License", icon: "🏥", notifyDays: 60 },
  { value: "business_license",  label: "Business License",             icon: "📋", notifyDays: 60 },
  { value: "business_insurance",label: "Business Insurance",           icon: "🛡️", notifyDays: 60 },
  { value: "hood_inspection",   label: "Hood Inspection Sticker",      icon: "💨", notifyDays: 60 },
  { value: "fire_suppression",  label: "Fire Suppression",             icon: "🧯", notifyDays: 60 },
  { value: "pest_control",      label: "Pest Control Report",          icon: "🐜", notifyDays: 30 },
  { value: "franchise_agreement",label: "Franchise Agreement",         icon: "🤝", notifyDays: 90 },
  { value: "lease_agreement",   label: "Lease Agreement",              icon: "🏢", notifyDays: 180 },
  { value: "food_inspection",   label: "Food Inspection Report",       icon: "🔍", notifyDays: 60 },
  { value: "other",             label: "Other",                        icon: "📎", notifyDays: 60 },
];

export function complianceType(value: string): ComplianceType {
  return COMPLIANCE_TYPES.find((t) => t.value === value) ?? COMPLIANCE_TYPES[COMPLIANCE_TYPES.length - 1];
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const ms = new Date(date + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(ms / 86_400_000);
}

// Status combines the type's notify window with how close the expiry is.
export function expiryLevel(date: string | null | undefined, notifyDays = 60): ExpiryLevel {
  const d = daysUntil(date);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= Math.min(14, notifyDays)) return "critical"; // 2 weeks out = red
  if (d <= notifyDays) return "warning";                 // inside lead time = amber
  return "ok";
}

export const LEVEL_ACCENT: Record<ExpiryLevel, "red" | "amber" | "green" | "slate"> = {
  expired: "red", critical: "red", warning: "amber", ok: "green", none: "slate",
};

export function expiryLabel(date: string | null | undefined): string {
  const d = daysUntil(date);
  if (d === null) return "No expiry";
  if (d < 0) return `Expired ${-d}d ago`;
  if (d === 0) return "Expires today";
  return `${d}d left`;
}
