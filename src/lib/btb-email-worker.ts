import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "./btb-api";
import { EmailDeliveryError, reminderServiceStatus } from "./btb-email";
import { renderDailyReportPdf } from "./btb-daily-pdf";
import type { DailyReportData } from "./btb-daily-report";

/**
 * General platform outbox worker: claim -> prepare (freeze) -> send ->
 * finish, mirroring the licence reminder dispatcher but for every outbox
 * kind. The first step also enqueues today's scheduled automation, so a
 * single cron hit both schedules and delivers.
 */

interface EmailJobRow {
  id: string;
  kind: string;
  business_date: string | null;
  location_id: string | null;
  recipient: string;
  subject: string;
  body: string;
  payload: unknown;
  frozen_from: string | null;
  attachment_name: string | null;
  attachment_base64: string | null;
  lease_token: string;
  attempts: number;
  uncertain: boolean;
}

export interface EmailWorkerRun {
  enqueued: number;
  claimed: number;
  accepted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const RESEND_CREATE_TIMEOUT = 12_000;
const RESERVE_MS = 4_000;

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function jobPayload(job: EmailJobRow): DailyReportData {
  return (job.payload && typeof job.payload === "object" ? job.payload : {}) as DailyReportData;
}

async function sendResend(from: string, job: EmailJobRow, attachment?: { filename: string; content: string }): Promise<string> {
  const status = reminderServiceStatus();
  if (!status.senderConfigured) {
    throw new EmailDeliveryError("Email delivery is not configured. Set RESEND_API_KEY and BTB_EMAIL_FROM on the server.", false);
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(RESEND_CREATE_TIMEOUT),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        // Frozen per job row: a retry after an uncertain result hits the same
        // Resend idempotency key, so the provider cannot double-send.
        "Idempotency-Key": `btb-${job.id}`,
      },
      body: JSON.stringify({
        from,
        to: [job.recipient],
        subject: job.subject,
        text: job.body,
        ...(attachment ? { attachments: [attachment] } : {}),
      }),
    });
    if (!response.ok) {
      throw new EmailDeliveryError(`The email provider returned HTTP ${response.status}.`, response.status >= 500 || response.status === 408);
    }
    const body: unknown = await response.json();
    const id = (body as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !id) {
      throw new EmailDeliveryError("The provider response did not confirm a message ID.", true);
    }
    return id;
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError("Delivery could not be confirmed. A retry uses the same provider idempotency key.", true);
  }
}

async function finish(
  db: SupabaseClient,
  job: EmailJobRow,
  provider: string,
  error: string | null,
  uncertain: boolean,
): Promise<boolean> {
  const result = await db.rpc("btb_finish_email_job", {
    p_id: job.id,
    p_lease: job.lease_token,
    p_provider: provider,
    p_error: error,
    p_uncertain: uncertain,
  });
  dbError(result.error, "The email delivery log could not be updated.");
  return result.data === true;
}

/**
 * Enqueue scheduled automations, then drain due jobs until the budget or the
 * limit is exhausted. Uncertain network/5xx/missing-provider-id outcomes are
 * finished as uncertain (never marked accepted) so the leased retry resumes
 * with the identical frozen payload and idempotency key.
 */
export async function dispatchDailyEmails(db: SupabaseClient, options: { limit?: number; budgetMs?: number } = {}): Promise<EmailWorkerRun> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 30);
  const budgetMs = options.budgetMs ?? 240_000;
  const run: EmailWorkerRun = { enqueued: 0, claimed: 0, accepted: 0, skipped: 0, failed: 0, errors: [] };
  const startedAt = Date.now();

  const scheduled = await db.rpc("btb_schedule_automation");
  dbError(scheduled.error, "Scheduled automations could not be queued.");
  const enqueued = (scheduled.data as { enqueued?: number } | null)?.enqueued;
  run.enqueued = typeof enqueued === "number" ? enqueued : 0;

  while (run.claimed < limit && elapsedSince(startedAt) + RESERVE_MS < budgetMs) {
    const claimed = await db.rpc("btb_claim_email_jobs", { p_limit: Math.min(limit - run.claimed, 5) });
    dbError(claimed.error, "The email outbox could not be leased.");
    const jobs = (claimed.data ?? []) as unknown as EmailJobRow[];
    if (!jobs.length) break;
    for (const job of jobs) {
      run.claimed += 1;
      try {
        if (await deliverOne(db, job)) run.accepted += 1;
        else run.skipped += 1;
      } catch (error) {
        const delivery = error instanceof EmailDeliveryError ? error : new EmailDeliveryError(error instanceof Error ? error.message : "Unknown delivery failure.", true);
        const leaseLost = !(await finish(db, job, "", `Attempt ${job.attempts}: ${delivery.message}`, delivery.uncertain));
        if (leaseLost) run.skipped += 1;
        else run.failed += 1;
        run.errors.push(`${job.kind} to ${job.recipient}: ${delivery.message}`);
      }
    }
  }
  return run;
}

/** Returns false (skip) when the lease was lost or the job was superseded. */
async function deliverOne(db: SupabaseClient, current: EmailJobRow): Promise<boolean> {
  if (current.kind !== "daily") {
    // Text-only kinds post straight with their frozen body; prepare only
    // freezes the sender, and there is nothing to regenerate.
    const preparedText = await db.rpc("btb_prepare_email_job", { p_id: current.id, p_lease: current.lease_token, p_from: process.env.BTB_EMAIL_FROM?.trim() ?? "" });
    dbError(preparedText.error, "The email payload could not be prepared.");
    const job = preparedText.data as EmailJobRow | null;
    if (!job) return false; // Lease lost or superseded - skip gracefully.
    const provider = await sendResend(job.frozen_from ?? process.env.BTB_EMAIL_FROM!.trim(), job);
    await finish(db, job, provider, null, false);
    return true;
  }

  // Render the PDF from the stored snapshot BEFORE the provider call, then
  // freeze it: every retry inside Resend's idempotency window re-sends the
  // identical attachment.
  const source = jobPayload(current);
  const meta = {
    location: String(source.location ?? "Between the Buns"),
    businessDate: String(current.business_date ?? source.business_date ?? ""),
    timezone: String(source.timezone ?? "local time"),
    generatedAt: new Date().toISOString(),
  };
  const pdf = await renderDailyReportPdf(source, meta);
  const attachmentBase64 = Buffer.from(pdf).toString("base64");
  const attachmentName = `BTB-Operations-${meta.businessDate}.pdf`;

  const prepared = await db.rpc("btb_prepare_email_job", {
    p_id: current.id,
    p_lease: current.lease_token,
    p_from: process.env.BTB_EMAIL_FROM?.trim() ?? "",
    p_attachment: attachmentBase64,
  });
  dbError(prepared.error, "The daily email payload could not be prepared.");
  const job = prepared.data as (EmailJobRow & { attachment_base64: string | null; frozen_from: string | null }) | null;
  if (!job || !job.frozen_from) return false; // Lease lost or superseded.
  const attachment = job.attachment_base64 ? { filename: job.attachment_name ?? attachmentName, content: job.attachment_base64 } : undefined;
  if (!attachment) throw new EmailDeliveryError("The daily PDF attachment was lost while preparing the job.", false);
  const provider = await sendResend(job.frozen_from, job, attachment);
  await finish(db, job, provider, null, false);
  return true;
}
