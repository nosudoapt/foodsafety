import { platformRoute, platformRpc } from "@/lib/btb-platform-route";
import type { PlatformBootstrap } from "@/lib/btb-platform";

// The signed-in person and the active locations they may work in. The SQL
// function re-checks active/login-enabled and the credential session version.
export const GET = platformRoute([], async ({ db, employeeId, sessionVersion }) => {
  return platformRpc<PlatformBootstrap>(db, "btb_platform_bootstrap", {
    p_actor: employeeId,
    p_session: sessionVersion,
  }, "Your location workspace could not be loaded.");
});
