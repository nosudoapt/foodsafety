import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, dbError, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { acceptBtbInvitation } from "@/lib/btb-invitations";
import { serviceDb } from "@/lib/supabase-server";
import { createWorkspaceSession, loginWorkspace, setWorkspaceCookie } from "@/lib/workspace-auth-server";

/** Accept an invitation: the person chooses their password, and we sign them in
 * through the same unified session everyone else uses. */
export async function POST(request: Request) {
  try {
    requireBtbOrigin(request, "Set your password from your invitation page.");
    const body = await readBody(request, 4096);
    const db = serviceDb();
    const person = await acceptBtbInvitation(db, body.token, body.password);

    // The invitation response carries no email, so read it back for this one id.
    const member = await db.from("btb_employees").select("email").eq("id", person.id).maybeSingle();
    dbError(member.error, "Your invitation was accepted. Sign in with your new password.");
    const email = typeof member.data?.email === "string" ? member.data.email : "";
    if (!email) throw new BtbApiError("Your invitation was accepted. Sign in with your new password.", 409);

    const principal = await loginWorkspace(email, String(body.password), request);
    const claims = await createWorkspaceSession(principal);
    const response = NextResponse.json({ ok: true, name: person.name, permittedView: claims.permittedView }, { headers: PRIVATE_HEADERS });
    await setWorkspaceCookie(response, claims);
    return response;
  } catch (error) { return apiFailure(error, request); }
}
