import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-team";
import { parseReminderEmails, validateReminderSettings } from "@/lib/btb-reminders";
import { reminderServiceStatus } from "@/lib/btb-email";
import { dispatchLicenceReminders, loadReminderDocuments, loadReminderSettings, REMINDER_LOG_COLUMNS, REMINDER_SETTINGS_COLUMNS } from "@/lib/btb-reminder-service";

export const maxDuration = 60;

export const GET = btbRoute("licence_reminders", false, async ({ db }, request) => {
  const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new BtbApiError("Choose a valid history page.");
  const [settings, documents, history] = await Promise.all([
    loadReminderSettings(db), loadReminderDocuments(db),
    db.from("btb_licence_email_log").select(REMINDER_LOG_COLUMNS).order("created_at", { ascending: false }).order("id").range(offset, offset + 50),
  ]);
  dbError(history.error, "Email delivery history could not be loaded.");
  return { settings, documents, logs: history.data?.slice(0, 50) ?? [], hasMore: (history.data?.length ?? 0) > 50, service: reminderServiceStatus(), asOf: new Date().toISOString() };
});

export const POST = btbRoute("licence_reminders", true, async ({ db }, request) => {
  const body = await readBody(request);
  if (body.action === "run") return dispatchLicenceReminders(db);
  const error = validateReminderSettings(body);
  if (error) throw new BtbApiError(error);
  if (body.enabled && !reminderServiceStatus().senderConfigured) throw new BtbApiError("Set RESEND_API_KEY and BTB_EMAIL_FROM on the server before enabling email reminders.", 503);
  const result = await db.from("btb_notification_settings").update({
    manager_emails: parseReminderEmails((body.manager_emails as string[]).join(" ")),
    corporate_emails: parseReminderEmails((body.corporate_emails as string[]).join(" ")),
    lead_days: [...new Set(body.lead_days as number[])].sort((a, b) => b - a),
    enabled: body.enabled, version: Number(body.version) + 1, updated_at: new Date().toISOString(),
  }).eq("restaurant_name", BTB_RESTAURANT).eq("version", body.version).select(REMINDER_SETTINGS_COLUMNS).maybeSingle();
  dbError(result.error, "Reminder settings could not be saved. Your form is still here.");
  if (!result.data) throw new BtbApiError("These settings changed. Reload the latest settings before saving.", 409);
  return { settings: result.data };
});
