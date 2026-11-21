import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFailure, btbIdentityFromSession, PRIVATE_HEADERS } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-roles";
import { inventoryDb } from "@/lib/supabase-server";
import { loadBtbEffectiveAccess } from "@/lib/btb-effective-access";
import { BTB_COOKIE } from "@/lib/btb-auth";

// Who is signed in to BTB (used by the hub header). Signed-out callers get no
// account list at all: the live sign-in is individual-only, and neither shared
// role addresses nor employee emails may be enumerated anonymously.
export async function GET() {
  try {
  const cookieStore = await cookies();
  const identity = await btbIdentityFromSession(cookieStore.get(BTB_COOKIE)?.value);

  if (!identity) {
    return NextResponse.json({ authenticated: false }, { headers: PRIVATE_HEADERS });
  }

  return NextResponse.json({
    authenticated: true,
    role: identity.role,
    email: identity.email,
    name: identity.name,
    employeeId: identity.employeeId,
    sessionVersion: identity.sessionVersion,
    restaurant: BTB_RESTAURANT,
    access: await loadBtbEffectiveAccess(inventoryDb(), identity),
  }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error); }
}
