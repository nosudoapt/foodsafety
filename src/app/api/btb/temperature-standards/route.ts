import { btbRequestLocation, btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { withLocation } from "@/lib/btb-location-context";
import { TEMPERATURE_TYPES, type TemperatureType } from "@/lib/btb-temperatures";
import { BTB_RESTAURANT } from "@/lib/btb-team";

const MANAGER_ROLES = ["manager", "owner", "corporate"];
const COLUMNS = "record_type,equipment_name,min_safe_temp,max_safe_temp";

/** A manager approves the local temperature limits once, per branch. Staff can
 *  then record off-form readings against exactly those values; the API never
 *  guesses, and one branch's limits never apply to another. */
export const POST = btbRoute("temperatures", true, async (context, request) => {
  const { db, identity } = context;
  const location = await btbRequestLocation(context, request);
  if (!MANAGER_ROLES.includes(identity.role)) {
    throw new BtbApiError("A manager or owner must approve temperature standards.", 403);
  }
  const body = await readBody(request, 4096);
  const recordType = String(body.record_type ?? "") as TemperatureType;
  if (!TEMPERATURE_TYPES.some((item) => item.value === recordType)) throw new BtbApiError("Choose a valid temperature record type.");
  const equipment = String(body.equipment_name ?? "").trim();
  if (!equipment || equipment.length > 150) throw new BtbApiError("Enter the equipment name (up to 150 characters).");
  const min = Number(body.min_safe_temp), max = Number(body.max_safe_temp);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < -273.15 || max > 999.99 || max < min) {
    throw new BtbApiError("Enter a valid safe range: the maximum must be at or above the minimum.");
  }
  const values = { min_safe_temp: min, max_safe_temp: max, approved_by: identity.name, approved_at: new Date().toISOString() };
  // Partial unique indexes cover owned and unowned rows separately, so the
  // upsert is an explicit lookup followed by an update or insert.
  const existing = await withLocation(db.from("btb_temperature_standards").select("id")
    .eq("restaurant_name", BTB_RESTAURANT).eq("record_type", recordType).eq("equipment_name", equipment), location).maybeSingle();
  dbError(existing.error, "The temperature standard could not be checked. Please retry.");
  const saved = existing.data
    ? await db.from("btb_temperature_standards").update(values).eq("id", existing.data.id).select(COLUMNS).maybeSingle()
    : await db.from("btb_temperature_standards").insert({
      restaurant_name: BTB_RESTAURANT, location_id: location?.id ?? null,
      record_type: recordType, equipment_name: equipment, ...values,
    }).select(COLUMNS).maybeSingle();
  dbError(saved.error, "The temperature standard could not be saved. Please retry.");
  if (!saved.data) throw new BtbApiError("The temperature standard was not confirmed. Please retry.", 503);
  return { standard: saved.data };
}, { allowLocationWorkspace: true });
