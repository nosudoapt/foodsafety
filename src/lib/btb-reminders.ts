import { isEmail, isVersion } from "./btb-team";
import { daysUntilExpiry } from "./btb-licences";

export interface ReminderSettings {
  manager_emails: string[]; corporate_emails: string[]; enabled: boolean; lead_days: number[];
  version: number; updated_at: string; last_run_at: string | null; last_run_error: string | null;
}
export interface ReminderDocument { source: "business" | "staff"; id: string; name: string; expiry_date: string }
export interface ReminderJob {
  id: string; source: ReminderDocument["source"]; document_id: string; document_name: string; expiry_date: string;
  lead_days: number; recipient: string; status: "pending" | "sending" | "sent" | "failed"; attempts: number;
  lease_until: string | null; lease_token: string | null; first_attempt_at: string | null; delivery_uncertain: boolean;
  provider_id: string | null; error: string | null; sent_at: string | null; created_at: string;
}
export interface ReminderServiceStatus { senderConfigured: boolean; schedulerConfigured: boolean }
export interface ReminderData { settings: ReminderSettings; documents: ReminderDocument[]; logs: ReminderJob[]; hasMore: boolean; service: ReminderServiceStatus; asOf: string }
export interface ReminderRun { sent: number; failed: number; skipped: number; remaining: number; disabled: boolean }

export function parseReminderEmails(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function validateReminderSettings(body: Record<string, unknown>): string | null {
  if (!isVersion(body.version) || typeof body.enabled !== "boolean") return "Reload the reminder settings and try again.";
  for (const field of ["manager_emails", "corporate_emails"] as const) {
    const emails = body[field];
    if (!Array.isArray(emails) || emails.length > 10 || emails.some((email) => !isEmail(email))) return "Enter up to 10 valid email addresses for each recipient group.";
    if (body.enabled && !emails.length) return "Add at least one manager address and one corporate address before enabling reminders.";
  }
  if (!Array.isArray(body.lead_days) || !body.lead_days.length || body.lead_days.length > 8 || body.lead_days.some((day) => !Number.isInteger(day) || day < 0 || day > 365)) return "Choose 1–8 reminder windows, from 0 to 365 days before expiry.";
  return null;
}

/** Catch a missed run at the nearest reached window, without a burst of old reminders. */
export function reminderLead(expiry: string, today: string, leadDays: readonly number[]): number | null {
  const days = daysUntilExpiry(expiry, today);
  if (days === null) return null;
  return [...leadDays].sort((a, b) => a - b).find((lead) => days <= lead) ?? null;
}

export function reminderKey(source: string, documentId: string, expiry: string, lead: number, recipient: string): string {
  return JSON.stringify([source, documentId, expiry, lead, recipient.toLowerCase()]);
}

export function reminderCanRetry(job: ReminderJob, now = Date.now()): boolean {
  if (job.status === "sent" || job.attempts >= 3 || job.lease_until && Date.parse(job.lease_until) > now) return false;
  // Resend retains idempotency keys for 24h. Leave an hour of margin, and never
  // replay an uncertain delivery outside that window. The history explains why.
  if (job.delivery_uncertain && job.first_attempt_at && now - Date.parse(job.first_attempt_at) >= 23 * 3_600_000) return false;
  return true;
}

export function reminderStatusLabel(job: ReminderJob, now: number): string {
  if (job.status === "sent") return "Sent";
  if (job.delivery_uncertain && !reminderCanRetry(job, now) && (!job.lease_until || Date.parse(job.lease_until) <= now)) return "Check provider";
  return job.status === "sending" ? "Sending / awaiting result" : job.status === "failed" ? "Failed" : "Pending";
}

/** Frozen job fields make every retry's provider payload identical. */
export function reminderMessage(job: Pick<ReminderJob, "document_name" | "expiry_date" | "source" | "lead_days">): { subject: string; text: string } {
  const type = job.source === "staff" ? "Staff certificate" : "Business licence / renewal";
  return {
    subject: `BTB expiry reminder · ${job.expiry_date}`,
    text: ["Between the Buns — licence expiry reminder", "", `${type}: ${job.document_name}`, `Expiry date: ${job.expiry_date}`,
      job.lead_days === 0 ? "This is the expiry-date / overdue reminder." : `This reminder is for the ${job.lead_days}-day renewal window.`, "",
      "Please arrange renewal and update the expiry date in the BTB workspace.",
      job.source === "staff" ? "Open Staff Licences & Certificates to update this record." : "Open Compliance & Renewals to update this record.",
      "", "This reminder is sent to the configured manager and corporate recipients."].join("\n"),
  };
}
