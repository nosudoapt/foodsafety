import { after } from "next/server";
import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { reminderServiceStatus } from "@/lib/btb-email";
import { issueBtbAdminInvitation } from "@/lib/btb-admin-invitations";
import { deliverInvitationEmail } from "@/lib/btb-invite-email";
import { createBtbInvitation } from "@/lib/btb-invitations";
import { validateBtbAdminPerson, type BtbInvitationReceipt } from "@/lib/btb-admin";
import { employeeEditableBy, isUuid, type BtbEmployee } from "@/lib/btb-team";

interface InvitationRpcResult {
  employee_id: string; invitation_id: string; expires_at: string;
  email_status: BtbInvitationReceipt["email_status"]; job_id?: string;
}

// A manager or supervisor invites a teammate from the workspace. The account
// is created without a password, the invitation is single-use, and the branded
// email is sent immediately (the outbox row remains for retries).
export const POST = btbRoute("employees", true, async ({ db, identity, access, session }, request) => {
  if (!identity.employeeId || !identity.sessionVersion) {
    throw new BtbApiError("Sign in with your individual employee account to invite teammates.", 401);
  }
  const body = await readBody(request);
  const locationId = String(body.locationId ?? "");
  const location = access.locations.find((site) => site.id === locationId && site.active);
  if (!location) throw new BtbApiError("Choose an active location you are assigned to.", 403);

  const employeeId = body.employeeId == null || body.employeeId === "" ? null : body.employeeId;
  let name: string;
  let email: string;
  let role: string;
  if (employeeId !== null) {
    if (!isUuid(employeeId)) throw new BtbApiError("Reload the team list before inviting this person.");
    const result = await db.from("btb_employees")
      .select("id,name,email,role,active,login_enabled,version,phone,position,created_at")
      .eq("id", employeeId).eq("restaurant_name", "Between the Buns").maybeSingle();
    dbError(result.error, "The employee record could not be verified.");
    const person = result.data as BtbEmployee | null;
    if (!person?.email) throw new BtbApiError("Add an email address before inviting this person.", 400);
    if (!employeeEditableBy(identity.role, person.role, identity.console === true)) throw new BtbApiError("Your role cannot invite this employee.", 403);
    name = person.name;
    email = person.email;
    role = person.role;
  } else {
    const invalid = validateBtbAdminPerson(body);
    if (invalid) throw new BtbApiError(invalid);
    role = String(body.role);
    if (!employeeEditableBy(identity.role, role as BtbEmployee["role"], identity.console === true)) {
      throw new BtbApiError("Your role cannot invite that level of employee.", 403);
    }
    name = String(body.name).trim();
    email = String(body.email).trim().toLowerCase();
  }

  const invitation = createBtbInvitation(request.headers.get("origin") ?? new URL(request.url).origin, name, location.name);
  // A console (tenant super-admin) that entered this branch is not an employee
  // manager: the manager-invite RPCs require a store manager with an individual
  // login, so they refuse it even though it may edit people here. It uses the
  // console's own invitation path instead — the same one its console People
  // panel uses, with the same single-use link and outbox job.
  if (identity.console) {
    // The console invitation types are the store tiers it may create here; the
    // route has already refused anything above the actor's authority above.
    const inviteRole = role as "staff" | "supervisor" | "manager";
    const issued = await issueBtbAdminInvitation(
      { db, admin: { id: session.principal.credentialId, name: session.principal.name, email: session.principal.email, sessionVersion: session.principal.sourceVersion ?? 1 }, session },
      request, location.id, employeeId !== null ? { id: employeeId } : { name, email, role: inviteRole },
    );
    const { dispatch } = issued;
    if (dispatch) after(dispatch);
    const receipt: BtbInvitationReceipt & { manualLink?: string } = { ...issued };
    delete (receipt as { dispatch?: unknown }).dispatch;
    return receipt;
  }
  const { data, error } = await db.rpc(employeeId !== null ? "btb_employee_issue_invite" : "btb_employee_add_person", {
    p_actor: identity.employeeId, p_session: identity.sessionVersion, p_location: location.id,
    ...(employeeId !== null ? { p_employee: employeeId } : { p_data: { name, email, role } }),
    p_token_hash: invitation.tokenHash, p_subject: invitation.subject, p_body: invitation.body,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : error.code?.startsWith("22") ? 400 : 503;
    throw new BtbApiError(status === 409
      ? "This email already belongs to a teammate with a different name or role. Use their existing details."
      : "The invitation could not be created. Apply the manager-invite schema, then retry.", status, error);
  }
  const result = data as InvitationRpcResult;
  const emailService = reminderServiceStatus();
  const delivery = emailService.senderConfigured && result.job_id && process.env.BTB_INVITE_SEND_NOW !== "0"
    ? await deliverInvitationEmail(db, {
        id: result.job_id, recipient: email, subject: invitation.subject, body: invitation.body, attempts: 0,
      })
    : { status: "pending" as const, error: undefined };
  return {
    employee_id: result.employee_id, invitation_id: result.invitation_id, expires_at: result.expires_at,
    email_status: delivery.status, ...(delivery.error ? { email_error: delivery.error } : {}), emailService,
    ...(!emailService.senderConfigured ? { manualLink: invitation.link } : {}),
  } satisfies BtbInvitationReceipt;
}, { allowLocationWorkspace: true });
