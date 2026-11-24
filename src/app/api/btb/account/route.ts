import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, dbError, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { hashEmployeePassword, validEmployeePassword, verifyEmployeePassword } from "@/lib/btb-passwords";
import { isEmployeeRole } from "@/lib/btb-team";
import { serviceDb } from "@/lib/supabase-server";
import { requireWorkspaceSession, revokeWorkspaceSession, setWorkspaceCookie, workspaceBtbIdentity } from "@/lib/workspace-auth-server";

/** Change your own employee password. Credentials are infrastructure: they are
 * read and written with the unscoped client, while the identity and the branch
 * come from the verified workspace session (never from the request body).
 *
 * The version bump also invalidates every issued cookie, so this request retires
 * its own session and asks the person to sign in again. */
export async function POST(request: Request) {
  try {
    requireBtbOrigin(request);
    const session = await requireWorkspaceSession();
    const identity = await workspaceBtbIdentity(session);
    if (!identity.employeeId || !isEmployeeRole(identity.role)) throw new BtbApiError("Sign in with your individual employee account to change your password.", 403);
    const body = await readBody(request, 4096);
    if (typeof body.currentPassword !== "string" || body.currentPassword.length > 128 || !validEmployeePassword(body.password)) {
      throw new BtbApiError("Enter your current password and a new password of 10–128 characters.");
    }

    const db = serviceDb();
    const credentials = await db.from("btb_employee_credentials").select("password_hash,session_version").eq("employee_id", identity.employeeId).single();
    dbError(credentials.error, "Your account could not be verified.");
    if (!credentials.data) throw new BtbApiError("Your account could not be verified. Please sign in again.", 401);
    if (!await verifyEmployeePassword(body.currentPassword, credentials.data.password_hash)) throw new BtbApiError("Your current password does not match.", 403);

    const saved = await db.from("btb_employee_credentials")
      .update({ password_hash: await hashEmployeePassword(body.password), session_version: credentials.data.session_version + 1, updated_at: new Date().toISOString() })
      .eq("employee_id", identity.employeeId).eq("session_version", credentials.data.session_version)
      .select("session_version").maybeSingle();
    dbError(saved.error, "Your password could not be changed. Please retry.");
    if (!saved.data) throw new BtbApiError("Your account changed. Please sign in again.", 409);

    await revokeWorkspaceSession(session.claims);
    const response = NextResponse.json({ ok: true, signInAgain: true }, { headers: PRIVATE_HEADERS });
    await setWorkspaceCookie(response);
    return response;
  } catch (error) { return apiFailure(error, request); }
}
