import "server-only";
import { BtbApiError } from "./btb-api";
import { btbAdminRpc, type BtbAdminContext } from "./btb-admin-api";
import { btbAdminLocation } from "./btb-admin-locations";
import { createBtbInvitation } from "./btb-invitations";
import { reminderServiceStatus } from "./btb-email";
import { deliverInvitationEmail } from "./btb-invite-email";
import type { BtbAdminPerson, BtbInvitationReceipt, BtbInviteRole } from "./btb-admin";

type InvitationRpcResult = Omit<BtbInvitationReceipt, "emailService"> & { job_id?: string };

export async function issueBtbAdminInvitation(context: BtbAdminContext, request: Request, locationId: string,
  person: { name: string; email: string; role: BtbInviteRole } | { id: string }) {
  const location = await btbAdminLocation(context, locationId);
  if (!location.active) throw new BtbApiError("Activate this location before inviting people.");
  let name: string;
  let email: string;
  if ("id" in person) {
    const data = await btbAdminRpc<{ people: BtbAdminPerson[] }>(context, "btb_admin_people", { p_location: location.id }, "People could not be loaded.");
    const existing = data.people.find(row => row.id === person.id);
    if (!existing) throw new BtbApiError("This person is not assigned to the location.", 404);
    name = existing.name;
    email = existing.email ?? "";
  } else {
    name = person.name;
    email = person.email;
  }
  // Origin has already passed the admin route's same-origin check. Do not trust
  // forwarded-host headers or accept a link/body/recipient from the client.
  const invitation = createBtbInvitation(request.headers.get("origin") ?? new URL(request.url).origin, name, location.name);
  const data = await btbAdminRpc<InvitationRpcResult>(context,
    "id" in person ? "btb_admin_reinvite" : "btb_admin_add_person",
    { p_location: location.id, ...("id" in person ? { p_employee: person.id } : { p_data: person }),
      p_token_hash: invitation.tokenHash, p_subject: invitation.subject, p_body: invitation.body },
    "The invitation could not be created. Check the person and location, then retry.");
  const emailService = reminderServiceStatus();
  // Clicking invite sends immediately. The queued row is settled afterwards so
  // the daily cron cannot deliver a second copy.
  const delivery = emailService.senderConfigured && data.job_id && email && process.env.BTB_INVITE_SEND_NOW !== "0"
    ? await deliverInvitationEmail(context.db, {
        id: data.job_id, recipient: email, subject: invitation.subject, body: invitation.body,
        attempts: 0,
      })
    : { status: data.email_status as BtbInvitationReceipt["email_status"], error: undefined };
  return { employee_id: data.employee_id, invitation_id: data.invitation_id, expires_at: data.expires_at,
    email_status: delivery.status as BtbInvitationReceipt["email_status"],
    ...(delivery.error ? { email_error: delivery.error } : {}), emailService,
    // Only the missing-sender fallback may expose the one-time raw link. It is
    // never saved in client storage, an audit event or the people list response.
    ...(!emailService.senderConfigured ? { manualLink: invitation.link } : {}) } satisfies BtbInvitationReceipt;
}
