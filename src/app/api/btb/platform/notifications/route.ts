import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

// Mark one in-app notification as read. The SQL function scopes the update to
// the signed-in recipient, so a leaked id cannot mark another person's inbox.
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 4_000);
  if (!isUuid(body.id)) throw new BtbApiError("Choose a notification.");
  const ok = await platformRpc<boolean>(db, "btb_platform_notification_read", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_id: body.id,
  }, "This notification could not be updated.");
  if (!ok) throw new BtbApiError("This notification is no longer in your inbox.", 404);
  return { ok: true };
});
