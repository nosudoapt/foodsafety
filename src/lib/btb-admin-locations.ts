import "server-only";
import { BtbApiError } from "./btb-api";
import { btbAdminRpc, type BtbAdminContext } from "./btb-admin-api";
import { isUuid } from "./btb-team";
import type { BtbAdminLocation, BtbAdminLocations } from "./btb-admin";

export function consoleUuid(value: unknown): string {
  if (!isUuid(value)) throw new BtbApiError("Choose a valid location or person.");
  return value;
}

export async function btbAdminLocation(context: BtbAdminContext, id: string): Promise<BtbAdminLocation> {
  consoleUuid(id);
  const data = await btbAdminRpc<BtbAdminLocations>(context, "btb_admin_locations", {}, "Locations could not be loaded.");
  const location = data.locations.find(site => site.id === id);
  if (!location) throw new BtbApiError("This location is not managed by the BTB console.", 404);
  return location;
}
