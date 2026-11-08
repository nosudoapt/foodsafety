import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { attributionName, BTB_RESTAURANT, btbToday } from "@/lib/btb-team";
import { parseTemperatureSheet, type BtbTemperatureRecord } from "@/lib/btb-temperatures";
import { temperatureOwner } from "@/lib/btb-temperature-store";

// One row per filled box on the daily sheet. Same storage scope as the single
// reading POST: the dedicated BTB storage profile, no location id.
const COLUMNS = "id,record_type,equipment_name,food_item,temperature,min_safe_temp,max_safe_temp,unit,is_safe,notes,recorded_at,business_date,slot";
type SheetRecord = BtbTemperatureRecord & { business_date: string | null; slot: string | null };

// The daily sheet IS the BTB temperature workflow: location-managed employees
// (the demo manager, staff in the location platform) record here too. The
// feature's view/edit matrix still applies, so unauthorized roles are refused.
export const POST = btbRoute("temperatures", true, async ({ db, identity }, request) => {
  const parsed = parseTemperatureSheet(await readBody(request, 24_000), btbToday());
  if (parsed.error) throw new BtbApiError(parsed.error);
  const sheet = parsed.value!;
  const owner = await temperatureOwner(db);
  const recordedBy = `Sheet by: ${attributionName(identity)}${identity.employeeId ? ` [${identity.employeeId}]` : ""}`;

  // The platform's unique index keys (location_id, equipment_id, …) with a
  // location; this sheet's rows have no location, and Postgres treats NULLs as
  // distinct, so duplicate protection is the read-back below — the same
  // append-once semantics as the single-reading POST.
  const existing = await db.from("temperature_records").select(COLUMNS)
    .eq("restaurant_name", BTB_RESTAURANT).eq("user_id", owner).is("location_id", null)
    .eq("business_date", sheet.date);
  dbError(existing.error, "The saved sheet could not be checked. Keep your entries and retry.");
  const previous = new Map((existing.data ?? []).map((row) => [`${row.equipment_name}|${row.slot ?? ""}`, row as SheetRecord]));

  const saved: SheetRecord[] = [];
  for (const cell of sheet.cells) {
    const record = previous.get(`${cell.label}|${cell.slot}`);
    if (record) {
      const same = record.temperature === cell.value && record.unit === cell.unit
        && record.min_safe_temp === cell.min_safe_temp && record.max_safe_temp === cell.max_safe_temp;
      if (!same) throw new BtbApiError(`${cell.label} (${cell.slot}) was already saved with a different reading. Reload the day before changing it.`, 409);
      saved.push(record);
      continue;
    }
    // The sanitizer row's standard lives on the form; food_item is NOT NULL in
    // the table, so it records the standard instead of pretending a food item.
    const isSanitizer = cell.unit === "PPM";
    const result = await db.from("temperature_records").insert({
      user_id: owner,
      restaurant_name: BTB_RESTAURANT,
      location_id: null,
      equipment_name: cell.label,
      food_item: isSanitizer ? "Sanitizer bucket (200–400 PPM standard)" : "Scheduled equipment check",
      record_type: cell.record_type === "sanitizer" ? "cold_storage" : cell.record_type,
      temperature: cell.value,
      unit: cell.unit,
      min_safe_temp: cell.min_safe_temp,
      max_safe_temp: cell.max_safe_temp,
      is_safe: cell.value >= cell.min_safe_temp && cell.value <= cell.max_safe_temp,
      notes: `${recordedBy}${isSanitizer ? " · sanitizer strength in PPM" : ""}`,
      recorded_by_name: attributionName(identity),
      recorded_at: new Date().toISOString(),
      business_date: sheet.date,
      slot: cell.slot,
    }).select(COLUMNS).single();
    if (result.error?.code === "23505") throw new BtbApiError(`${cell.label} (${cell.slot}) was just saved from another device. Reload the day to see it.`, 409);
    dbError(result.error, `The reading for ${cell.label} (${cell.slot}) wasn’t saved. The rest of the sheet is still here; please try again.`);
    if (!result.data) throw new BtbApiError(`The save for ${cell.label} (${cell.slot}) could not be confirmed. Keep this sheet and retry.`, 503);
    const record_ = result.data as SheetRecord;
    previous.set(`${cell.label}|${cell.slot}`, record_);
    saved.push(record_);
  }
  return { date: sheet.date, records: saved };
}, { allowLocationWorkspace: true });
