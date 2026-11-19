import "server-only";
import { BtbApiError } from "./btb-api";
import { btbAdminRpc, type BtbAdminContext } from "./btb-admin-api";
import { btbAdminLocation } from "./btb-admin-locations";
import { createBtbInvitation } from "./btb-invitations";
import { reminderServiceStatus } from "./btb-email";
import type { BtbAdminPerson, BtbInvitationReceipt, BtbInviteRole } from "./btb-admin";

export async function issueBtbAdminInvitation(context: BtbAdminContext, request: Request, locationId: string,
  person: { name: string; email: string; role: BtbInviteRole } | { id: string }) {
  const location = await btbAdminLocation(context, locationId);
  if (!location.active) throw new BtbApiError("Activate this location before inviting people.");
  let name: string;
  if ("id" in person) {
    const data = await btbAdminRpc<{ people: BtbAdminPerson[] }>(context, "btb_admin_people", { p_location: location.id }, "People could not be loaded.");
    const existing = data.people.find(row => row.id === person.id);
    if (!existing) throw new BtbApiError("This person is not assigned to the location.", 404);
    name = existing.name;
  } else name = person.name;
  // Origin has already passed the admin route's same-origin check. Do not trust
  // forwarded-host headers or accept a link/body/recipient from the client.
  const invitation = createBtbInvitation(request.headers.get("origin") ?? new URL(request.url).origin, name, location.name);
  const data = await btbAdminRpc<Omit<BtbInvitationReceipt, "emailService">>(context,
    "id" in person ? "btb_admin_reinvite" : "btb_admin_add_person",
    { p_location: location.id, ...("id" in person ? { p_employee: person.id } : { p_data: person }),
      p_token_hash: invitation.tokenHash, p_subject: invitation.subject, p_body: invitation.body },
    "The invitation could not be created. Check the person and location, then retry.");
  const emailService = reminderServiceStatus();
  return { employee_id: data.employee_id, invitation_id: data.invitation_id, expires_at: data.expires_at,
    email_status: data.email_status, emailService,
    // Only the missing-sender fallback may expose the one-time raw link. It is
    // never saved in client storage, an audit event or the people list response.
    ...(!emailService.senderConfigured ? { manualLink: invitation.link } : {}) } satisfies BtbInvitationReceipt;
}
