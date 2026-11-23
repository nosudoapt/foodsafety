import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { policyFromRow } from "@/lib/btb-clock-policy";
import { isUuid } from "@/lib/btb-team";

const COLUMNS = "clock_geofence,clock_latitude,clock_longitude,clock_radius_m,clock_require_network,clock_networks,clock_require_device";

export const GET = btbRoute(undefined, false, async ({ db, access }, request) => {
  const location = new URL(request.url).searchParams.get("location");
  if (!isUuid(location)) throw new BtbApiError("Choose a branch.");
  if (!access.locations.some((site) => site.id === location)) throw new BtbApiError("This branch is not in your workspace.", 403);
  const result = await db.from("btb_location_settings").select(COLUMNS).eq("location_id", location).maybeSingle();
  dbError(result.error, "The clock-in policy could not be loaded.");
  return { policy: policyFromRow(result.data as Record<string, unknown> | null) };
}, { allowLocationWorkspace: true });

export const POST = btbRoute("staff_schedule", true, async ({ db, identity, access }, request) => {
  if (identity.role !== "manager") throw new BtbApiError("Only a branch manager can change the clock-in location policy.", 403);
  const body = await readBody(request, 8192);
  const location = String(body.location_id ?? "");
  if (!access.locations.some((site) => site.id === location && site.active)) throw new BtbApiError("Choose an active branch you manage.", 403);
  const geofence = body.geofence === true;
  const latitude = body.latitude === "" || body.latitude == null ? null : Number(body.latitude);
  const longitude = body.longitude === "" || body.longitude == null ? null : Number(body.longitude);
  const radiusM = Number(body.radiusM ?? 150);
  if (geofence && (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
    throw new BtbApiError("Enter the restaurant latitude and longitude before enabling the geofence.");
  }
  if (!Number.isInteger(radiusM) || radiusM < 25 || radiusM > 5000) throw new BtbApiError("Set a radius between 25 and 5,000 metres.");
  const rawNetworks: unknown = body.networks;
  const networks = (Array.isArray(rawNetworks) ? rawNetworks : typeof rawNetworks === "string" ? rawNetworks.split(/[\n,]/) : [])
    .map((item) => String(item).trim()).filter(Boolean);
  if (networks.length > 20 || networks.some((item) => !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(item) && !/^[0-9a-fA-F:.]+$/.test(item))) {
    throw new BtbApiError("Enter valid IPv4/IPv6 addresses or CIDR ranges, one per line.");
  }
  const saved = await db.from("btb_location_settings").update({
    clock_geofence: geofence, clock_latitude: latitude, clock_longitude: longitude, clock_radius_m: radiusM,
    clock_require_network: body.requireNetwork === true, clock_networks: networks,
    clock_require_device: body.requireDevice === true, updated_at: new Date().toISOString(),
  }).eq("location_id", location).select(COLUMNS).maybeSingle();
  dbError(saved.error, "The clock-in policy could not be saved.");
  if (!saved.data) throw new BtbApiError("The clock-in policy was not confirmed.", 503);
  if (isUuid(body.reset_employee_id)) {
    const reset = await db.from("btb_clock_devices").delete().eq("employee_id", body.reset_employee_id).eq("location_id", location);
    dbError(reset.error, "The approved device could not be reset.");
  }
  return { policy: policyFromRow(saved.data as Record<string, unknown>) };
}, { allowLocationWorkspace: true });
