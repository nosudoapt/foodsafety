import "server-only";
import { isEmail } from "./btb-team";
import { reminderMessage, type ReminderJob, type ReminderServiceStatus } from "./btb-reminders";

export function reminderServiceStatus(): ReminderServiceStatus {
  const from = process.env.BTB_EMAIL_FROM?.trim() ?? "";
  const address = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  return { senderConfigured: !!process.env.RESEND_API_KEY?.trim() && !/[\r\n]/.test(from) && isEmail(address), schedulerConfigured: !!process.env.CRON_SECRET?.trim() };
}

export class EmailDeliveryError extends Error {
  constructor(message: string, public uncertain: boolean) { super(message); }
}

export async function sendLicenceEmail(job: ReminderJob): Promise<string> {
  if (!reminderServiceStatus().senderConfigured) throw new EmailDeliveryError("Email delivery is not configured. Set RESEND_API_KEY and BTB_EMAIL_FROM on the server.", false);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json", "Idempotency-Key": `btb-licence-${job.id}` },
      body: JSON.stringify({ from: process.env.BTB_EMAIL_FROM!.trim(), to: [job.recipient], ...reminderMessage(job) }),
    });
    if (!response.ok) throw new EmailDeliveryError(`The email provider returned HTTP ${response.status}. Check the sender configuration and delivery history.`, response.status >= 500 || response.status === 408);
    const body = await response.json();
    if (typeof body?.id !== "string" || !body.id) throw new EmailDeliveryError("The provider response did not confirm a message ID. Check the provider before resending.", true);
    return body.id;
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError("Delivery could not be confirmed. A retry uses the same provider idempotency key.", true);
  }
}
