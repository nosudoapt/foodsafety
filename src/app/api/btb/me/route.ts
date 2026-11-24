import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-roles";
import { loadBtbEffectiveAccess } from "@/lib/btb-effective-access";
import { requireWorkspaceSession, workspaceBtbIdentity } from "@/lib/workspace-auth-server";
import { inWorkspace } from "@/lib/workspace-request-context";

// Who is signed in to BTB (used by the hub header). The identity comes from the
// one verified workspace session, so a signed-out caller gets nothing at all and
// nobody can enumerate employee names, roles or emails anonymously.
export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession();
    const identity = await workspaceBtbIdentity(session);
    const access = await inWorkspace({ claims: session.claims, db: session.db },
      () => loadBtbEffectiveAccess(session.db, identity));
    return NextResponse.json({
      authenticated: true,
      role: identity.role,
      email: identity.email,
      name: identity.name,
      employeeId: identity.employeeId,
      console: identity.console === true,
      sessionVersion: identity.sessionVersion,
      restaurant: BTB_RESTAURANT,
      locationId: session.claims.locationId,
      access,
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    // A signed-out visitor (or a principal outside BTB) simply is not signed in.
    if (error instanceof Error && "status" in error && (error as { status?: number }).status === 401) {
      return NextResponse.json({ authenticated: false }, { headers: PRIVATE_HEADERS });
    }
    return apiFailure(error, request);
  }
}
