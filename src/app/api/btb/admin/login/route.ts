import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { clientIp } from "@/lib/btb-clock-policy";
import { authenticateBtbAdmin, BTB_ADMIN_COOKIE, BTB_ADMIN_MAX_AGE, btbAdminSessionValueFor } from "@/lib/btb-admin-auth";
import { inventoryDb } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    requireBtbOrigin(request, "Sign in from the BTB console.");
    const body = await readBody(request, 4096);
    const admin = await authenticateBtbAdmin(inventoryDb(), String(body.email ?? ""), String(body.password ?? ""), clientIp(request));
    const response = NextResponse.json({ ok: true, name: admin.name }, { headers: PRIVATE_HEADERS });
    response.cookies.set(BTB_ADMIN_COOKIE, btbAdminSessionValueFor({ id: admin.id, version: admin.sessionVersion }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: BTB_ADMIN_MAX_AGE,
    });
    return response;
  } catch (error) { return apiFailure(error, request); }
}
