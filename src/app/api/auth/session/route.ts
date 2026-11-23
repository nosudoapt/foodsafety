import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/btb-api";
import { WORKSPACE_COOKIE } from "@/lib/workspace-auth-types";
import { AUTH_PRIVATE_HEADERS, publicWorkspaceSession, workspaceSessionFromValue } from "@/lib/workspace-auth-server";

export async function GET(request: Request) {
  try {
    const session = await workspaceSessionFromValue((await cookies()).get(WORKSPACE_COOKIE)?.value);
    return NextResponse.json(session ? publicWorkspaceSession(session) : { authenticated: false }, { headers: AUTH_PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request); }
}
