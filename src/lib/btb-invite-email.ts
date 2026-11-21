// SERVER-ONLY: turns a frozen invitation body into the branded welcome email
// and can deliver it immediately instead of waiting for the daily outbox
// worker. Retries still go through the same job row and Resend idempotency
// key, so an immediate send followed by a cron retry cannot double-send.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Same sender check as ./btb-email, kept local so this module stays free of
 *  the server-only import and can be unit-tested in plain Node. */
function senderConfigured(): boolean {
  const from = process.env.BTB_EMAIL_FROM?.trim() ?? "";
  const address = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  return !!process.env.RESEND_API_KEY?.trim() && !/[\r\n]/.test(from)
    && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address);
}

export interface InvitationJob {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
}

export type InvitationDeliveryStatus = "pending" | "accepted" | "failed";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The setup link is the only URL in the frozen invitation body. */
export function invitationDetails(body: string): { name: string; location: string; link: string } {
  const name = body.match(/^Hi (.+?),/m)?.[1]?.trim() || "there";
  const link = body.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? "";
  const location = body.match(/workspace at (.+?)\.\s/m)?.[1]?.trim() || "Between the Buns";
  return { name, location, link };
}

/** A plain, table-based HTML email (no external assets) so it renders in
 *  Gmail, Outlook and Apple Mail without tracking pixels. */
export function invitationEmailHtml(body: string): string {
  const { name, location, link } = invitationDetails(body);
  const safeName = escapeHtml(name);
  const safeLocation = escapeHtml(location);
  const safeLink = escapeHtml(link);
  const origin = link ? escapeHtml(new URL(link).origin) : "https://foodsafety-sigma.vercel.app";
  const button = safeLink
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0"><tr><td style="border-radius:10px;background:#b42318"><a href="${safeLink}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">Set up my password</a></td></tr></table>
       <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#667085">Button not working? Copy this link into your browser:</p>
       <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;word-break:break-all"><a href="${safeLink}" style="color:#b42318">${safeLink}</a></p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Between the Buns</title></head>
<body style="margin:0;padding:0;background:#f4f1ea">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Set your Between the Buns password and open your team workspace.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e1d6">
        <tr><td style="background:#111827;padding:26px 32px">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f6c177">Between the Buns</p>
          <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#cbd5e1">Team workspace · powered by Pholo</p>
        </td></tr>
        <tr><td style="padding:36px 32px 8px">
          <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:#111827">Welcome to the team.</h1>
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#344054">Hi ${safeName},</p>
          <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#344054">You’ve been invited to the <strong>Between the Buns</strong> workspace at <strong>${safeLocation}</strong>. Choose your own password below — it is yours alone and works at every location you’re assigned to.</p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#344054">After you set it, sign in at <a href="${origin}/btb/login" style="color:#b42318;font-weight:600">the team sign-in page</a> with your email and new password. You’ll see exactly the tools your role allows.</p>
          ${button}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f0;border:1px solid #efe8da;border-radius:10px;margin:0 0 26px"><tr><td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#667085">
            This link can be used once and expires seven days after it was sent. If it has expired, ask your manager for a new invitation.
          </td></tr></table>
          <p style="margin:0 0 30px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#667085">If you weren’t expecting this invitation, you can ignore this email — no account is created until you set a password.</p>
        </td></tr>
        <tr><td style="background:#faf7f0;border-top:1px solid #efe8da;padding:20px 32px">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#98a2b3">Between the Buns · sent by Pholo. Please don’t reply to this message; contact your restaurant manager instead.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function markFailed(db: SupabaseClient, job: InvitationJob, error: string, uncertain: boolean): Promise<void> {
  const attempts = job.attempts + 1;
  const delayMs = Math.min(60, 2 ** Math.min(attempts, 6)) * 60_000;
  await db.from("btb_email_jobs").update({
    status: "failed", error, attempts, uncertain, lease_token: null, lease_until: null,
    available_at: new Date(Date.now() + delayMs).toISOString(),
  }).eq("id", job.id).in("status", ["pending", "failed"]);
}

/** Send now, then settle the existing outbox row so the cron does not send a
 *  second copy. Any failure keeps the row retryable for the daily worker. */
export async function deliverInvitationEmail(db: SupabaseClient, job: InvitationJob): Promise<{ status: InvitationDeliveryStatus; error?: string }> {
  if (!senderConfigured()) return { status: "pending" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `btb-${job.id}`,
      },
      body: JSON.stringify({
        from: process.env.BTB_EMAIL_FROM!.trim(),
        to: [job.recipient],
        subject: job.subject,
        text: job.body,
        html: invitationEmailHtml(job.body),
      }),
    });
    if (!response.ok) {
      const detail: unknown = await response.json().catch(() => null);
      const message = typeof (detail as { message?: unknown } | null)?.message === "string"
        ? `: ${((detail as { message: string }).message).slice(0, 300)}`
        : "";
      const error = `The email provider returned HTTP ${response.status}${message}`;
      await markFailed(db, job, error, response.status >= 500 || response.status === 408);
      return { status: "failed", error };
    }
    const body = await response.json() as { id?: unknown } | null;
    if (typeof body?.id !== "string" || !body.id) {
      const error = "The email provider did not confirm a message ID.";
      await markFailed(db, job, error, true);
      return { status: "failed", error };
    }
    await db.from("btb_email_jobs").update({
      status: "accepted", provider_id: body.id, accepted_at: new Date().toISOString(),
      error: null, lease_token: null, lease_until: null,
    }).eq("id", job.id).in("status", ["pending", "failed"]);
    return { status: "accepted" };
  } catch (cause) {
    const error = cause instanceof Error ? `Delivery could not be confirmed: ${cause.message}` : "Delivery could not be confirmed.";
    await markFailed(db, job, error, true).catch(() => undefined);
    return { status: "failed", error };
  }
}
