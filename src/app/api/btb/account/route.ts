import { cookies } from "next/headers";
import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { BTB_COOKIE, BTB_EMPLOYEE_MAX_AGE, employeeSessionValueFor } from "@/lib/btb-auth";
import { hashEmployeePassword, validEmployeePassword, verifyEmployeePassword } from "@/lib/btb-passwords";
import { isEmployeeRole } from "@/lib/btb-team";

export const POST = btbRoute(undefined, true, async ({ db, identity }, request) => {
  if (!identity.employeeId || !isEmployeeRole(identity.role)) throw new BtbApiError("Sign in with your individual employee account to change your password.", 403);
  const body = await readBody(request, 4096);
  if (typeof body.currentPassword !== "string" || body.currentPassword.length > 128 || !validEmployeePassword(body.password)) throw new BtbApiError("Enter your current password and a new password of 10–128 characters.");
  const credentials = await db.from("btb_employee_credentials").select("password_hash,session_version").eq("employee_id", identity.employeeId).single();
  dbError(credentials.error, "Your account could not be verified.");
  if (!credentials.data) throw new BtbApiError("Your account could not be verified. Please sign in again.", 401);
  if (!await verifyEmployeePassword(body.currentPassword, credentials.data.password_hash)) throw new BtbApiError("Your current password does not match.", 403);
  const version = credentials.data.session_version + 1;
  const saved = await db.from("btb_employee_credentials").update({ password_hash: await hashEmployeePassword(body.password), session_version: version, updated_at: new Date().toISOString() })
    .eq("employee_id", identity.employeeId).eq("session_version", identity.sessionVersion!).select("session_version").maybeSingle();
  dbError(saved.error, "Your password could not be changed. Please retry.");
  if (!saved.data) throw new BtbApiError("Your account changed. Please sign in again.", 409);
  (await cookies()).set(BTB_COOKIE, employeeSessionValueFor({ id: identity.employeeId, role: identity.role, version }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: BTB_EMPLOYEE_MAX_AGE });
  return { ok: true };
});
