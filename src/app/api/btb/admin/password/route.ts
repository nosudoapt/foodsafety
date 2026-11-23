import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { requireBtbAdmin } from "@/lib/btb-admin-api";
import { changeBtbAdminPassword } from "@/lib/btb-admin-password";
import { serviceDb } from "@/lib/supabase-server";
import { revokeWorkspaceSession, setWorkspaceCookie } from "@/lib/workspace-auth-server";

/** Rotate the console password. The version bump invalidates every issued
 * cookie (including this one), so the console signs out and asks for the new
 * password instead of pretending the old session still works. */
export async function POST(request: Request) {
  try {
    requireBtbOrigin(request, "Change your console password from the BTB console.");
    const body = await readBody(request, 4096);
    const { admin, session } = await requireBtbAdmin();
    await changeBtbAdminPassword(serviceDb(), admin, String(body.currentPassword ?? ""), String(body.newPassword ?? ""));
    await revokeWorkspaceSession(session.claims);
    const response = NextResponse.json({ ok: true, signInAgain: true }, { headers: PRIVATE_HEADERS });
    await setWorkspaceCookie(response);
    return response;
  } catch (error) { return apiFailure(error, request); }
}
