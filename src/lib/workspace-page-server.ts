import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WORKSPACE_COOKIE } from "./workspace-auth-types";
import { workspaceSessionFromValue, type VerifiedWorkspaceSession } from "./workspace-auth-server";
import { workspacePageAllowed } from "./workspace-page-access";

// React cache only deduplicates one render pass, never another user/request.
export const workspacePageSession = cache(async (): Promise<VerifiedWorkspaceSession> => {
  const session = await workspaceSessionFromValue((await cookies()).get(WORKSPACE_COOKIE)?.value);
  if (!session) redirect("/auth/sign-in");
  return session;
});

export async function requireWorkspacePage(path: string, locationId?: string): Promise<VerifiedWorkspaceSession> {
  const session = await workspacePageSession();
  if (!workspacePageAllowed(path, session.claims) || (locationId !== undefined && locationId !== session.claims.locationId)) {
    redirect(session.claims.permittedView);
  }
  return session;
}
