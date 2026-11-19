import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS, requireBtbOrigin } from "@/lib/btb-api";
import { BTB_ADMIN_COOKIE } from "@/lib/btb-admin-auth";

export async function POST(request: Request) {
  try {
    requireBtbOrigin(request);
    const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
    response.cookies.set(BTB_ADMIN_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  } catch (error) { return apiFailure(error, request); }
}
