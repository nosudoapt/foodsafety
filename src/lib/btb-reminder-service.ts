import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError, dbError, readAll } from "./btb-api";
import { BTB_RESTAURANT, btbToday } from "./btb-team";
import { licenceTypeLabel } from "./btb-licences";
import { reminderCanRetry, reminderKey, reminderLead, type ReminderDocument, type ReminderJob, type ReminderRun, type ReminderSettings } from "./btb-reminders";
import { EmailDeliveryError, reminderServiceStatus, sendLicenceEmail } from "./btb-email";

export const REMINDER_SETTINGS_COLUMNS = "manager_emails,corporate_emails,enabled,lead_days,version,updated_at,last_run_at,last_run_error";
export const REMINDER_LOG_COLUMNS = "id,source,document_id,document_name,expiry_date,lead_days,recipient,status,attempts,lease_until,first_attempt_at,delivery_uncertain,provider_id,error,sent_at,created_at";

export async function loadReminderSettings(db: SupabaseClient): Promise<ReminderSettings> {
  const result = await db.from("btb_notification_settings").select(REMINDER_SETTINGS_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).single();
  dbError(result.error, "Licence reminder settings could not be loaded.");
  if (!result.data) throw new BtbApiError("Licence reminders need the BTB team-operations schema.", 503);
  return result.data as ReminderSettings;
}

export async function loadReminderDocuments(db: SupabaseClient): Promise<ReminderDocument[]> {
  const [business, staff, corporate] = await Promise.all([
    readAll<{ id: string; name: string; expiry_date: string }>((from, to) => db.from("compliance_documents").select("id,name,expiry_date").eq("restaurant_name", BTB_RESTAURANT).is("location_id", null).not("expiry_date", "is", null).order("id").range(from, to), "Business licence dates could not be loaded."),
    readAll<{ id: string; staff_name: string; license_type: string; expiry_date: string }>((from, to) => db.from("btb_staff_licences").select("id,staff_name,license_type,expiry_date").eq("restaurant_name", BTB_RESTAURANT).not("expiry_date", "is", null).order("id").range(from, to), "Staff certificate dates could not be loaded."),
    // Tax / renewal deadlines (corporate_dates): company-wide rows, like the
    // business licences; site-scoped rows show in the location record instead.
    readAll<{ id: string; title: string; category: string; due_date: string; recurrence: string }>((from, to) => db.from("corporate_dates").select("id,title,category,due_date,recurrence").is("location_id", null).order("id").range(from, to), "Tax and renewal deadlines could not be loaded."),
  ]);
  return [
    ...business.map((row): ReminderDocument => ({ ...row, source: "business" })),
    ...staff.map((row): ReminderDocument => ({ id: row.id, name: `${row.staff_name} · ${licenceTypeLabel(row.license_type)}`, expiry_date: row.expiry_date, source: "staff" })),
    ...corporate.map((row): ReminderDocument => ({ id: row.id, name: `${row.title} (${row.category})`, expiry_date: nextDueDate(row.due_date, row.recurrence), source: "tax" })),
  ].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.name.localeCompare(b.name));
}

/** Recurring deadlines roll forward so an aged-out filing stays actionable. */
export function nextDueDate(dueDate: string, recurrence: string, today = btbToday()): string {
  if (!["monthly", "quarterly", "annual"].includes(recurrence)) return dueDate;
  let due = dueDate;
  const addStep = (value: string): string => {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    if (recurrence === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
    else if (recurrence === "quarterly") date.setUTCMonth(date.getUTCMonth() + 3);
    else date.setUTCFullYear(date.getUTCFullYear() + 1);
    return date.toISOString().slice(0, 10);
  };
  let guard = 0;
  while (due < today && guard++ < 10) due = addStep(due);
  return due;
}

/** Transactional claims + frozen provider idempotency keys make concurrent runs safe. */
export async function dispatchLicenceReminders(db: SupabaseClient, { limit = 30, budgetMs = 45_000 } = {}): Promise<ReminderRun> {
  const result: ReminderRun = { sent: 0, failed: 0, skipped: 0, remaining: 0, disabled: false };
  const started = Date.now();
  const settings = await loadReminderSettings(db);
  try {
    if (!settings.enabled) result.disabled = true;
    else {
      if (!reminderServiceStatus().senderConfigured) throw new BtbApiError("Email delivery is not configured. Set RESEND_API_KEY and BTB_EMAIL_FROM on the server.", 503);
      if (!settings.manager_emails.length || !settings.corporate_emails.length) throw new BtbApiError("Add manager and corporate recipients before sending reminders.");
      const [documents, logs] = await Promise.all([
        loadReminderDocuments(db),
        readAll<ReminderJob>((from, to) => db.from("btb_licence_email_log").select("*").order("id").range(from, to), "Previous email attempts could not be verified."),
      ]);
      const previous = new Map(logs.map((job) => [reminderKey(job.source, job.document_id, job.expiry_date, job.lead_days, job.recipient), job]));
      const recipients = [...new Set([...settings.manager_emails, ...settings.corporate_emails].map((email) => email.toLowerCase()))];
      const today = btbToday();
      const candidates = documents.flatMap((document) => {
        const lead = reminderLead(document.expiry_date, today, settings.lead_days);
        return lead === null ? [] : recipients.map((recipient) => ({ document, lead, recipient }));
      });
      let attempted = 0;
      const failedJobs = new Set<string>();
      for (const { document, lead, recipient } of candidates) {
        const key = reminderKey(document.source, document.id, document.expiry_date, lead, recipient);
        const old = previous.get(key);
        if (old && !reminderCanRetry(old)) { result.skipped++; continue; }
        if (attempted >= limit || Date.now() - started > budgetMs - 13_000) { result.remaining++; continue; }
        // Re-check current settings in the claim transaction. Removed recipients,
        // renewed/deleted licences and disabled reminders are never newly claimed.
        const claim = await db.rpc("btb_claim_licence_email", { p_source: document.source, p_document_id: document.id, p_name: document.name, p_expiry: document.expiry_date, p_lead: lead, p_recipient: recipient });
        dbError(claim.error, "An email reminder could not be reserved. Try again.");
        const job = (claim.data as ReminderJob[] | null)?.[0];
        if (!job) { result.skipped++; continue; }
        attempted++;
        let sent: string | null = null;
        let failure: EmailDeliveryError | null = null;
        try { sent = await sendLicenceEmail(job); }
        catch (error) { failure = error instanceof EmailDeliveryError ? error : new EmailDeliveryError("Delivery could not be confirmed.", true); }
        const outcome = {
          status: sent ? "sent" : "failed", provider_id: sent, sent_at: sent ? new Date().toISOString() : null,
          delivery_uncertain: failure?.uncertain ?? false, error: failure?.message ?? null, lease_until: null, lease_token: null,
        } satisfies Partial<ReminderJob>;
        const completed = await db.from("btb_licence_email_log").update(outcome).eq("id", job.id).eq("lease_token", job.lease_token).eq("status", "sending").select("id");
        dbError(completed.error, "The delivery result could not be saved. Check delivery history before retrying.");
        if (completed.data?.length !== 1) throw new BtbApiError("The email lease changed before its result was saved. Check delivery history.", 409);
        const latest = { ...job, ...outcome };
        previous.set(key, latest);
        if (sent) { result.sent++; failedJobs.delete(job.id); }
        else {
          failedJobs.add(job.id);
          // Retry in the same bounded run, while the provider's idempotency key
          // is fresh. The database still limits each job to three total claims.
          if (reminderCanRetry(latest)) candidates.push({ document, lead, recipient });
        }
        result.failed = failedJobs.size;
        // Resend's standard sending limit is 2 requests/sec. Pace this batch.
        await new Promise((resolve) => setTimeout(resolve, 550));
      }
    }
    const saved = await db.from("btb_notification_settings").update({ last_run_at: new Date().toISOString(), last_run_error: result.failed ? `${result.failed} reminder attempts failed. Check delivery history.` : result.remaining ? `${result.remaining} reminders await the next batch.` : null }).eq("restaurant_name", BTB_RESTAURANT).select("restaurant_name");
    dbError(saved.error, "Reminders ran, but the run summary could not be saved.");
    if (saved.data?.length !== 1) throw new BtbApiError("The reminder summary could not be confirmed.", 503);
    return result;
  } catch (error) {
    await db.from("btb_notification_settings").update({ last_run_at: new Date().toISOString(), last_run_error: error instanceof BtbApiError ? error.message : "Reminder delivery could not be completed." }).eq("restaurant_name", BTB_RESTAURANT);
    throw error;
  }
}
