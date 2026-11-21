import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { requireBtbAdmin } from "@/lib/btb-admin-api";
import { BTB_ADMIN_COOKIE, BTB_ADMIN_MAX_AGE, btbAdminSessionValueFor } from "@/lib/btb-admin-auth";
import { changeBtbAdminPassword } from "@/lib/btb-admin-password";

/** Rotate the console password. The cookie is re-signed with the new version so
 * this tab stays signed in while every other console session is revoked. */
export async function POST(request: Request) {
  try {
    requireBtbOrigin(request, "Change your console password from the BTB console.");
    const body = await readBody(request, 4096);
    const { db, admin } = await requireBtbAdmin();
    const result = await changeBtbAdminPassword(db, admin, String(body.currentPassword ?? ""), String(body.newPassword ?? ""));
    const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
    response.cookies.set(BTB_ADMIN_COOKIE, btbAdminSessionValueFor({ id: admin.id, version: result.sessionVersion }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: BTB_ADMIN_MAX_AGE,
    });
    return response;
  } catch (error) { return apiFailure(error, request); }
}
