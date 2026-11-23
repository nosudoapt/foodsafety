import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, readBody } from "@/lib/btb-api";
import { AUTH_PRIVATE_HEADERS, createWorkspaceSession, requireAuthOrigin, requireWorkspaceSession, setWorkspaceCookie } from "@/lib/workspace-auth-server";

/** Selection request, never an authorization authority: re-check the signed
 * allowed set AND live membership, then rotate the location-bound session. */
export async function POST(request: Request) {
  try {
    requireAuthOrigin(request);
    const session = await requireWorkspaceSession();
    const body = await readBody(request, 1024);
    if (Object.keys(body).join(",") !== "locationId" || typeof body.locationId !== "string"
      || !session.claims.allowedLocationIds.includes(body.locationId)
      || !session.principal.locations.some(site => site.id === body.locationId)) throw new BtbApiError("This location is not in your workspace.", 403);
    const claims = await createWorkspaceSession(session.principal, body.locationId, session.claims.exp, session.claims.sid);
    const response = NextResponse.json({ ok: true, permittedView: claims.permittedView }, { headers: AUTH_PRIVATE_HEADERS });
    await setWorkspaceCookie(response, claims);
    return response;
  } catch (error) { return apiFailure(error, request); }
}
