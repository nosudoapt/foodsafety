import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { parseReadingCommand } from "@/lib/btb-platform";
import { temperatureOwner } from "@/lib/btb-temperature-store";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

// Record a scheduled Celsius equipment reading or a separate sanitizer PPM
// reading. Celsius and PPM never share a column or a kind.
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 32_000);
  const location = body.location_id;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  const parsed = parseReadingCommand(body);
  if (!parsed.ok) throw new BtbApiError(parsed.error);
  const command = parsed.value;
  const reading = await platformRpc(db, "btb_platform_save_reading", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_profile: await temperatureOwner(db),
    p_data: {
      kind: command.kind,
      date: command.date,
      slot: command.slot,
      value: command.value,
      version: command.version,
      notes: command.notes,
      ...(command.equipment_id ? { equipment_id: command.equipment_id } : {}),
    },
  }, "This reading could not be saved.");
  return { reading };
});
