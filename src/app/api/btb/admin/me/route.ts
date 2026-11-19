import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiFailure, PRIVATE_HEADERS } from "@/lib/btb-api";
import { BTB_ADMIN_COOKIE, btbAdminIdentityFromSession } from "@/lib/btb-admin-auth";
import { inventoryDb } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const value = (await cookies()).get(BTB_ADMIN_COOKIE)?.value;
    const admin = value ? await btbAdminIdentityFromSession(value, inventoryDb()) : null;
    return NextResponse.json(admin ? { authenticated: true, admin: { id: admin.id, name: admin.name, email: admin.email } } : { authenticated: false }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request); }
}
