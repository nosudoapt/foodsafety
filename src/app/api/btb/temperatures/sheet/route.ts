import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { attributionName, btbToday } from "@/lib/btb-team";
import { parseTemperatureSheet, type BtbTemperatureRecord } from "@/lib/btb-temperatures";
import { temperatureOwner } from "@/lib/btb-temperature-store";

// One row per filled box on the daily sheet. Same storage scope as the single
// reading POST: the dedicated BTB storage profile, no location id.

// The daily sheet IS the BTB temperature workflow: location-managed employees
// (the demo manager, staff in the location platform) record here too. The
// feature's view/edit matrix still applies, so unauthorized roles are refused.
export const POST = btbRoute("temperatures", true, async ({ db, identity }, request) => {
  const parsed = parseTemperatureSheet(await readBody(request, 24_000), btbToday());
  if (parsed.error) throw new BtbApiError(parsed.error);
  const sheet = parsed.value!;
  const owner = await temperatureOwner(db);
  const result = await db.rpc("btb_save_temperature_sheet", {
    p_owner: owner, p_date: sheet.date,
    p_cells: sheet.cells.map(({ label, slot, value }) => ({ label, slot, value })),
    p_actor: `${attributionName(identity)}${identity.employeeId ? ` [${identity.employeeId}]` : ""}`,
  });
  dbError(result.error, "The sheet wasn’t saved. Keep all your entries and retry; no partial sheet has been accepted.");
  if (!Array.isArray(result.data) || result.data.length !== sheet.cells.length) throw new BtbApiError("The sheet save could not be confirmed. Keep this sheet and retry.", 503);
  // Do not expose owner/tenant or other server-only columns from the RPC row.
  const records = result.data.map((row) => {
    const { id, record_type, equipment_name, food_item, temperature, min_safe_temp, max_safe_temp, unit, is_safe, notes, recorded_at, business_date, slot } = row;
    return { id, record_type, equipment_name, food_item, temperature, min_safe_temp, max_safe_temp, unit, is_safe, notes, recorded_at, business_date, slot } as BtbTemperatureRecord;
  });
  return { date: sheet.date, records };
}, { allowLocationWorkspace: true });
