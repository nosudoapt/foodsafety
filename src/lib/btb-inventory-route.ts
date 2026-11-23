import "server-only";
import { apiFailure, btbRequestLocation, BtbApiError, requireBtbAccess, requireBtbOrigin, type BtbApiContext } from "./btb-api";
import type { BtbLocationContext } from "./btb-location-context";
import type { NextResponse } from "next/server";
import { inWorkspace } from "./workspace-request-context";

/** The branch every inventory handler works inside. Resolved from the session and
 *  the workspace slug — never from a client-supplied id. */
export interface BtbInventoryScope {
  identity: BtbApiContext["identity"];
  location: BtbLocationContext;
}

/** Keep the older inventory role/month/finalization checks, but put current page
 *  grants and the branch boundary in front of every handler. A request with no
 *  branch (the shared demo, or an employee with no assignment) is refused rather
 *  than falling back to company-wide rows. */
export function btbInventoryRoute(handler: (scope: BtbInventoryScope, request: Request) => Promise<NextResponse>) {
  return async (request: Request) => {
    try {
      const edit = !["GET", "HEAD"].includes(request.method);
      if (edit) requireBtbOrigin(request);
      const context = await requireBtbAccess("month_end_inventory", edit, { allowLocationWorkspace: true });
      const location = await btbRequestLocation(context, request);
      if (!location) throw new BtbApiError("Open a branch workspace to use month-end inventory.", 400);
      return await inWorkspace({ claims: context.session.claims, db: context.db }, () => handler({ identity: context.identity, location }, request));
    } catch (error) { return apiFailure(error, request); }
  };
}
