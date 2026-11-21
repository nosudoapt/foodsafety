// Public console types. Credentials and signing code live in btb-admin-auth.
import { BTB_CARDS } from "./btb-hub";
import { pageSlug } from "./btb-page-access";
import { isEmail, isVersion } from "./btb-team";

export interface BtbAdminIdentity {
  id: string;
  email: string;
  name: string;
  sessionVersion: number;
}

export const BTB_INVITE_ROLES = ["staff", "supervisor", "manager"] as const;
export type BtbInviteRole = (typeof BTB_INVITE_ROLES)[number];
export const isBtbInviteRole = (value: unknown): value is BtbInviteRole => BTB_INVITE_ROLES.includes(value as BtbInviteRole);
export const BTB_LOCATION_PAGES = BTB_CARDS.filter(card => card.feature !== "admin_dashboard");

export interface BtbAdminLocation {
  id: string; name: string; address: string | null; active: boolean; timezone: string | null;
  version: number; storage_limit_bytes: number; created_at: string; people: number; pages: string[];
}
export interface BtbAdminLocations { locations: BtbAdminLocation[] }
export interface BtbConsoleEmailService { senderConfigured: boolean; schedulerConfigured: boolean }
export type BtbConsoleEmailStatus = "pending" | "sending" | "accepted" | "failed" | "cancelled";
export interface BtbAdminPerson {
  id: string; name: string; email: string | null; role: string; status: "active" | "invited" | "blocked";
  last_login_at: string | null; location_ids: string[];
  invitation: null | { expires_at: string; used_at: string | null; created_at: string; email_status: BtbConsoleEmailStatus | null; email_error: string | null };
}
export interface BtbAdminPeople { people: BtbAdminPerson[]; emailService: BtbConsoleEmailService }
export interface BtbInvitationReceipt {
  employee_id: string; invitation_id: string; expires_at: string; email_status: BtbConsoleEmailStatus;
  emailService: BtbConsoleEmailService; manualLink?: string;
}
export interface BtbInvitationInfo { name: string; email: string; location: string; expires_at: string }

export function validateBtbAdminLocation(input: Record<string, unknown>, edit = false): string | null {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 150) return "Enter a location name (up to 150 characters).";
  if (typeof input.address !== "string" || input.address.length > 300) return "Keep the address under 300 characters.";
  if (typeof input.timezone !== "string" || !input.timezone || input.timezone.length > 100) return "Choose an IANA timezone, such as America/Regina.";
  try { new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone }).format(); }
  catch { return "Choose an IANA timezone, such as America/Regina."; }
  if (edit && (!isVersion(input.version) || input.version < 1 || typeof input.active !== "boolean")) return "Reload this location before saving.";
  if ("pages" in input && (!Array.isArray(input.pages) || input.pages.length > BTB_LOCATION_PAGES.length
    || input.pages.some(page => typeof page !== "string" || !BTB_LOCATION_PAGES.some(card => pageSlug(card) === page))
    || new Set(input.pages).size !== input.pages.length)) return "Choose valid, distinct workspace pages.";
  return null;
}

export function validateBtbAdminPerson(input: Record<string, unknown>): string | null {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100 || /[\r\n]/.test(input.name)) return "Enter a person’s name (up to 100 characters).";
  if (typeof input.email !== "string" || !isEmail(input.email.trim()) || input.email.trim().toLowerCase().endsWith("@btb.demo")) return "Enter a real employee email, not a shared demo address.";
  if (!isBtbInviteRole(input.role)) return "Choose staff, supervisor or manager.";
  return null;
}

export function btbInvitationDeliveryLabel(invitation: BtbAdminPerson["invitation"], now = Date.now()): string {
  if (!invitation) return "No invitation on record";
  if (invitation.used_at) return "Password set";
  if (new Date(invitation.expires_at).getTime() <= now) return "Link expired";
  return ({ pending: "Email queued", sending: "Email sending", accepted: "Email provider accepted", failed: "Email failed · retry pending", cancelled: "Email cancelled" } as const)[invitation.email_status ?? "cancelled"];
}

export const BTB_MONITORING_MIN_DAYS = 7;
export const BTB_MONITORING_MAX_DAYS = 31;
export const BTB_MONITORING_WINDOWS = [7, 14, 30] as const;

export interface BtbAdminMonitoringProblem {
  failed_emails: number; failed_imports: number; changes_requested: number; total: number;
}
export interface BtbAdminMonitoringFeature { type: string; count: number }
export interface BtbAdminMonitoringLocation {
  id: string; name: string; active: boolean; timezone: string | null;
  people: number; pages: number;
  files: number; storage_bytes: number; storage_limit_bytes: number;
  file_purposes: Record<string, { files: number; bytes: number }>;
  views: number; events: number; last_seen: string | null;
  ai_used: number; ai_daily_limit: number;
  last_activity: string | null; busiest_hour: number | null;
  features: BtbAdminMonitoringFeature[];
  open_entries: number;
  checks_complete: number; temperature_readings: number; sanitizer_readings: number;
  problems: BtbAdminMonitoringProblem;
  latest_email_error: string | null; email_pending: number;
}
export interface BtbAdminMonitoringEvent {
  created_at: string; location_id: string; location: string;
  entity_type: string; action: string; actor_name: string;
}
export interface BtbAdminMonitoring {
  days: number; generated_at: string; day_labels: string[];
  heatmap: number[][];
  totals: {
    locations: number; active_locations: number; people: number;
    files: number; storage_bytes: number; storage_limit_bytes: number;
    views: number; events: number; ai_used: number;
    problems: number; open_entries: number; email_pending: number;
  };
  locations: BtbAdminMonitoringLocation[];
  recent: BtbAdminMonitoringEvent[];
}

/** The overview's activity window: integer days, bounded to the SQL contract. */
export function btbAdminMonitoringDays(input: string | null): number | null {
  if (input === null || input === "") return 30;
  if (!/^\d{1,2}$/.test(input)) return null;
  const value = Number(input);
  return value >= BTB_MONITORING_MIN_DAYS && value <= BTB_MONITORING_MAX_DAYS ? value : null;
}
