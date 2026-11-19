import { btbAdminRoute, btbAdminRpc } from "@/lib/btb-admin-api";
import { consoleUuid } from "@/lib/btb-admin-locations";
import { issueBtbAdminInvitation } from "@/lib/btb-admin-invitations";
import { BtbApiError, readBody } from "@/lib/btb-api";

type Context = { params: Promise<{ locationId: string; employeeId: string }> };

export async function PATCH(request: Request, route: Context) {
  return btbAdminRoute(async (context, req) => {
    const params = await route.params;
    const locationId = consoleUuid(params.locationId), employeeId = consoleUuid(params.employeeId);
    const body = await readBody(req, 4096);
    if (body.action === "reinvite") return issueBtbAdminInvitation(context, req, locationId, { id: employeeId });
    if (body.action !== "block") throw new BtbApiError("Choose block or re-invite.");
    await btbAdminRpc(context, "btb_admin_block_person", { p_location: locationId, p_employee: employeeId }, "This person could not be blocked.");
    return { ok: true };
  })(request);
}

export async function DELETE(request: Request, route: Context) {
  return btbAdminRoute(async context => {
    const params = await route.params;
    await btbAdminRpc(context, "btb_admin_remove_person", { p_location: consoleUuid(params.locationId), p_employee: consoleUuid(params.employeeId) }, "This membership could not be removed.");
    return { ok: true };
  })(request);
}
