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

// --- shared list helpers (used by the compliance page and DocumentVault) ---

// Shown on both modules so the split is self-explanatory: Compliance holds
// anything with an expiry_date; Business Documents holds plain files (null).
export const DOC_ROUTING_HINT =
  "Does it expire and need a reminder? → Compliance. Is it just a file? → Business Docs.";

// Lower rank = more urgent, so an ascending sort surfaces expired items first.
export const URGENCY_RANK: Record<ExpiryLevel, number> = {
  expired: 0, critical: 1, warning: 2, ok: 3, none: 4,
};

/** A level that should raise an alert (expired or inside its notify window). */
export function isAlertLevel(level: ExpiryLevel): boolean {
  return level === "expired" || level === "critical" || level === "warning";
}

/**
 * Sort rows by expiry urgency (expired → critical → warning → ok → none),
 * breaking ties by soonest expiry. Generic over any row shape via accessors.
 */
export function sortByUrgency<T>(
  rows: readonly T[],
  docType: (row: T) => string,
  expiry: (row: T) => string | null | undefined
): T[] {
  return [...rows].sort((a, b) => {
    const la = expiryLevel(expiry(a), complianceType(docType(a)).notifyDays);
    const lb = expiryLevel(expiry(b), complianceType(docType(b)).notifyDays);
    if (URGENCY_RANK[la] !== URGENCY_RANK[lb]) return URGENCY_RANK[la] - URGENCY_RANK[lb];
    return (daysUntil(expiry(a)) ?? 1e9) - (daysUntil(expiry(b)) ?? 1e9);
  });
}

/** Rows whose expiry currently warrants attention, most urgent first. */
export function alertsFrom<T>(
  rows: readonly T[],
  docType: (row: T) => string,
  expiry: (row: T) => string | null | undefined
): T[] {
  return sortByUrgency(rows, docType, expiry).filter((r) =>
    isAlertLevel(expiryLevel(expiry(r), complianceType(docType(r)).notifyDays))
  );
}
