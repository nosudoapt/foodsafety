import { NextResponse } from "next/server";
import { apiFailure, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { acceptBtbInvitation } from "@/lib/btb-invitations";
import { BTB_COOKIE, BTB_EMPLOYEE_MAX_AGE, employeeSessionValueFor } from "@/lib/btb-auth";
import { inventoryDb } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    requireBtbOrigin(request, "Set your password from your invitation page.");
    const body = await readBody(request, 4096);
    const person = await acceptBtbInvitation(inventoryDb(), body.token, body.password);
    const response = NextResponse.json({ ok: true, name: person.name }, { headers: PRIVATE_HEADERS });
    response.cookies.set(BTB_COOKIE, employeeSessionValueFor({ id: person.id, role: person.role, version: person.version }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: BTB_EMPLOYEE_MAX_AGE,
    });
    return response;
  } catch (error) { return apiFailure(error, request); }
}
