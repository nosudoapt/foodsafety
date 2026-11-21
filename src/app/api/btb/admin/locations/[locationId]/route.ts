import { btbAdminRoute, btbAdminRpc } from "@/lib/btb-admin-api";
import { btbAdminLocation, consoleUuid } from "@/lib/btb-admin-locations";
import { BtbApiError, readBody } from "@/lib/btb-api";
import { validateBtbAdminLocation } from "@/lib/btb-admin";

type Context = { params: Promise<{ locationId: string }> };

export async function GET(request: Request, route: Context) {
  return btbAdminRoute(async context => ({ location: await btbAdminLocation(context, (await route.params).locationId) }))(request);
}

export async function PATCH(request: Request, route: Context) {
  return btbAdminRoute(async (context, req) => {
    const locationId = consoleUuid((await route.params).locationId);
    const body = await readBody(req, 16_384);
    const error = validateBtbAdminLocation(body, true);
    if (error) throw new BtbApiError(error);
    return btbAdminRpc(context, "btb_admin_update_location", { p_location: locationId, p_version: body.version, p_data: {
      name: (body.name as string).trim(), slug: typeof body.slug === "string" ? body.slug.trim() : "",
      address: (body.address as string).trim(), active: body.active, timezone: body.timezone,
      ...("pages" in body ? { pages: body.pages } : {}),
    } }, "The location could not be saved.");
  })(request);
}
