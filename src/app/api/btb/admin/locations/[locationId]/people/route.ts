import { after } from "next/server";
import { btbAdminRoute, btbAdminRpc } from "@/lib/btb-admin-api";
import { consoleUuid } from "@/lib/btb-admin-locations";
import { issueBtbAdminInvitation } from "@/lib/btb-admin-invitations";
import { BtbApiError, readBody } from "@/lib/btb-api";
import { validateBtbAdminPerson, type BtbAdminPerson, type BtbInviteRole } from "@/lib/btb-admin";
import { reminderServiceStatus } from "@/lib/btb-email";

type Context = { params: Promise<{ locationId: string }> };

export async function GET(request: Request, route: Context) {
  return btbAdminRoute(async context => ({
    ...await btbAdminRpc<{ people: BtbAdminPerson[] }>(context, "btb_admin_people", { p_location: consoleUuid((await route.params).locationId) }, "People could not be loaded."),
    emailService: reminderServiceStatus(),
  }))(request);
}

export async function POST(request: Request, route: Context) {
  return btbAdminRoute(async (context, req) => {
    const locationId = consoleUuid((await route.params).locationId);
    const body = await readBody(req, 4096);
    const error = validateBtbAdminPerson(body);
    if (error) throw new BtbApiError(error);
    const { dispatch, ...receipt } = await issueBtbAdminInvitation(context, req, locationId, {
      name: (body.name as string).trim(), email: (body.email as string).trim().toLowerCase(), role: body.role as BtbInviteRole,
    });
    // The invitation and its setup token are already committed. The email is
    // dispatched after this response, so a cold start or a slow mail provider
    // can never make a successful invitation look like a timeout.
    if (dispatch) after(dispatch);
    return receipt;
  })(request);
}
