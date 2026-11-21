import "server-only";
import { apiFailure, requireBtbAccess, requireBtbOrigin } from "./btb-api";
import type { NextResponse } from "next/server";

/** Keep the older inventory role/month/finalization checks, but put current
 * page grants and the legacy-vs-location boundary in front of every handler. */
export function btbInventoryRoute(handler: (request: Request) => Promise<NextResponse>) {
  return async (request: Request) => {
    try {
      const edit = !["GET", "HEAD"].includes(request.method);
      if (edit) requireBtbOrigin(request);
      await requireBtbAccess("month_end_inventory", edit, { allowLocationWorkspace: true });
      return await handler(request);
    } catch (error) { return apiFailure(error, request); }
  };
}
