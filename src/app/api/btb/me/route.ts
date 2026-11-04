import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFailure, btbIdentityFromSession, PRIVATE_HEADERS } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-roles";
import {
  BTB_ACCOUNTS,
  BTB_COOKIE,
  btbPasswordIsDefault,
  btbPassword,
} from "@/lib/btb-auth";

// Who is signed in to BTB (used by the hub header), plus — when signed out —
// the list of shared accounts for the login screen. Password hints are only
// returned in local development; production never exposes a login password.
export async function GET() {
  try {
  const cookieStore = await cookies();
  const identity = await btbIdentityFromSession(cookieStore.get(BTB_COOKIE)?.value);

  if (!identity) {
    return NextResponse.json({
      authenticated: false,
      accounts: BTB_ACCOUNTS.map((a) => ({ role: a.role, email: a.email, name: a.name })),
      passwordHint: btbPasswordIsDefault() ? btbPassword() : null,
    }, { headers: PRIVATE_HEADERS });
  }

  return NextResponse.json({
    authenticated: true,
    role: identity.role,
    email: identity.email,
    name: identity.name,
    employeeId: identity.employeeId,
    restaurant: BTB_RESTAURANT,
  }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error); }
}
