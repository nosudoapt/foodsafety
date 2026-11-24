import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WORKSPACE_COOKIE } from "./workspace-auth-types";
import { workspaceSessionFromValue, type VerifiedWorkspaceSession } from "./workspace-auth-server";
import { workspacePageAllowed } from "./workspace-page-access";
import { consoleBranchIds } from "./workspace-console-sites";
import { serviceDb } from "./supabase-server";

// React cache only deduplicates one render pass, never another user/request.
export const workspacePageSession = cache(async (): Promise<VerifiedWorkspaceSession> => {
  const session = await workspaceSessionFromValue((await cookies()).get(WORKSPACE_COOKIE)?.value);
  if (!session) redirect("/auth/sign-in");
  return session;
});

export async function requireWorkspacePage(path: string, locationId?: string): Promise<VerifiedWorkspaceSession> {
  const session = await workspacePageSession();
  if (!workspacePageAllowed(path, session.claims)) redirect(session.claims.permittedView);
  if (locationId !== undefined && locationId !== session.claims.locationId) {
    // A console manages its whole estate, so any branch it is assigned to opens —
    // not only the one its session happens to be pinned to. Employees keep the
    // strict single-branch rule (their permittedView is their own branch).
    const allowed = await consoleBranchIds(serviceDb(), session.claims, session.principal);
    if (!allowed.includes(locationId)) redirect(session.claims.permittedView);
  }
  return session;
}
