import "server-only";
import { randomUUID } from "node:crypto";
import { BtbApiError } from "./btb-api";
import { btbAdminRpc, type BtbAdminContext } from "./btb-admin-api";
import { btbAdminLocation } from "./btb-admin-locations";
import { createBtbInvitation } from "./btb-invitations";
import { reminderServiceStatus } from "./btb-email";
import { deliverInvitationEmail } from "./btb-invite-email";
import { serviceDb } from "./supabase-server";
import type { BtbAdminPerson, BtbInvitationReceipt, BtbInviteRole } from "./btb-admin";

type InvitationRpcResult = Omit<BtbInvitationReceipt, "emailService"> & { job_id?: string };

export interface IssuedBtbInvitation extends BtbInvitationReceipt {
  /** Runs after the response is sent (see after() in the route). The invitation
   *  row and setup token are already committed, so a cold start or a slow mail
   *  provider can never turn a successful invitation into a client timeout. */
  dispatch?: () => Promise<void>;
}

export async function issueBtbAdminInvitation(context: BtbAdminContext, request: Request, locationId: string,
  person: { name: string; email: string; role: BtbInviteRole } | { id: string }): Promise<IssuedBtbInvitation> {
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
  const jobId = data.job_id;
  // A console may manage a branch other than the one its session is pinned to,
  // so the outbox row is settled with the service client by its exact job id:
  // the RPC above already authorized the location, and the request-scoped client
  // is pinned to the session's branch. This is never a browser client.
  const dispatch = emailService.senderConfigured && jobId && email && process.env.BTB_INVITE_SEND_NOW !== "0"
    ? async () => {
        await deliverInvitationEmail(serviceDb(), {
          id: jobId, recipient: email, subject: invitation.subject, body: invitation.body,
          attempts: 0, lease: randomUUID(),
        }).catch(() => undefined);
      }
    : undefined;
  return { employee_id: data.employee_id, invitation_id: data.invitation_id, expires_at: data.expires_at,
    // The send happens after this response, so "queued" is the honest status.
    email_status: dispatch ? "pending" : data.email_status as BtbInvitationReceipt["email_status"],
    emailService,
    // Only the missing-sender fallback may expose the one-time raw link. It is
    // never saved in client storage, an audit event or the people list response.
    ...(!emailService.senderConfigured ? { manualLink: invitation.link } : {}),
    ...(dispatch ? { dispatch } : {}) };
}
