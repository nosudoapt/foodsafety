import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/btb-api";
import { WORKSPACE_COOKIE } from "@/lib/workspace-auth-types";
import { AUTH_PRIVATE_HEADERS, requireAuthOrigin, revokeWorkspaceSession, setWorkspaceCookie, workspaceSessionFromValue } from "@/lib/workspace-auth-server";

export async function POST(request: Request) {
  try {
    requireAuthOrigin(request);
    const session = await workspaceSessionFromValue((await cookies()).get(WORKSPACE_COOKIE)?.value);
    if (session) await revokeWorkspaceSession(session.claims);
    const response = NextResponse.json({ ok: true }, { headers: AUTH_PRIVATE_HEADERS });
    await setWorkspaceCookie(response);
    return response;
  } catch (error) { return apiFailure(error, request); }
}
