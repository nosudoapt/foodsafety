import { btbRoute, BtbApiError, dbError, readAll, readBody } from "@/lib/btb-api";
import { attributionName, BTB_RESTAURANT, btbToday } from "@/lib/btb-team";
import { parseTemperature, temperatureInRange, type BtbTemperatureRecord } from "@/lib/btb-temperatures";
import { temperatureOwner } from "@/lib/btb-temperature-store";

const COLUMNS = "id,record_type,equipment_name,food_item,temperature,min_safe_temp,max_safe_temp,unit,is_safe,notes,recorded_at";

export const GET = btbRoute("temperatures", false, async ({ db }) => {
  const owner = await temperatureOwner(db);
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const records = await readAll<BtbTemperatureRecord>((from, to) => db.from("temperature_records")
    .select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT).eq("user_id", owner).is("location_id", null)
    .gte("recorded_at", cutoff).order("recorded_at", { ascending: false }).order("id").range(from, to),
  "Temperature history couldn’t be loaded. Please try again.");
  return { records, today: btbToday() };
});

export const POST = btbRoute("temperatures", true, async ({ db, identity }, request) => {
  const parsed = parseTemperature(await readBody(request, 16_000));
  if (parsed.error) throw new BtbApiError(parsed.error);
  const input = parsed.value!;
  const owner = await temperatureOwner(db);
  const payload = {
    ...input, user_id: owner, restaurant_name: BTB_RESTAURANT, location_id: null, unit: "C",
    is_safe: temperatureInRange(input.temperature, input.min_safe_temp, input.max_safe_temp),
    // Human-readable attribution fits the existing notes column without a SQL
    // migration. The server supplies the actor; the browser cannot impersonate one.
    notes: `Recorded by: ${attributionName(identity)}${identity.employeeId ? ` [${identity.employeeId}]` : ""}${input.notes ? `\n${input.notes}` : ""}`,
  };
  const savedReading = async () => {
    const result = await db.from("temperature_records").select(COLUMNS).eq("id", input.id)
      .eq("restaurant_name", BTB_RESTAURANT).eq("user_id", owner).is("location_id", null).maybeSingle();
    dbError(result.error, "The saved reading could not be checked. Keep this form and retry.");
    const record = result.data;
    if (!record) return null;
    const same = ["record_type", "equipment_name", "food_item", "temperature", "min_safe_temp", "max_safe_temp", "unit", "notes"]
      .every((key) => record[key as keyof typeof record] === payload[key as keyof typeof payload]);
    if (!same) throw new BtbApiError("This reading was already saved with different details. Close this form and add a new reading.", 409);
    return record;
  };
  const previous = await savedReading();
  if (previous) return { record: previous };
  const result = await db.from("temperature_records").insert({ ...payload, recorded_at: new Date().toISOString() }).select(COLUMNS).single();
  // A retry (including two simultaneous saves) is append-once, never an upsert
  // that silently replaces a previously recorded reading.
  if (result.error?.code === "23505") {
    const previous = await savedReading();
    if (previous) return { record: previous };
  }
  dbError(result.error, "The reading wasn’t saved. Your entries are still here; please try again.");
  if (!result.data) throw new BtbApiError("The save could not be confirmed. Keep this form and retry.", 503);
  return { record: result.data };
});
