import { btbAdminRoute, btbAdminRpc } from "@/lib/btb-admin-api";
import { BtbApiError, readBody } from "@/lib/btb-api";
import { validateBtbAdminLocation, type BtbAdminLocations } from "@/lib/btb-admin";

export const GET = btbAdminRoute(context => btbAdminRpc<BtbAdminLocations>(context, "btb_admin_locations", {}, "Locations could not be loaded."));

export const POST = btbAdminRoute(async (context, request) => {
  const body = await readBody(request, 16_384);
  const error = validateBtbAdminLocation(body);
  if (error) throw new BtbApiError(error);
  return btbAdminRpc(context, "btb_admin_create_location", { p_data: {
    name: (body.name as string).trim(), slug: typeof body.slug === "string" ? body.slug.trim() : "",
    address: (body.address as string).trim(), timezone: body.timezone, pages: body.pages ?? [],
  } }, "The location could not be created.");
});
