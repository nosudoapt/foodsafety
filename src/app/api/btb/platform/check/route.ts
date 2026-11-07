import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { parseCheckCommand } from "@/lib/btb-platform";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

// Save an opening, closing or cleaning checklist for one location.
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 64_000);
  const location = body.location_id;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  const parsed = parseCheckCommand(body);
  if (!parsed.ok) throw new BtbApiError(parsed.error);
  const command = parsed.value;
  const check = await platformRpc(db, "btb_platform_save_check", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_date: command.date,
    p_kind: command.kind,
    p_version: command.version,
    p_changes: command.changes,
    p_notes: command.notes,
  }, "This checklist could not be saved.");
  return { check };
});
