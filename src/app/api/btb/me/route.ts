import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFailure, btbIdentityFromSession, dbError, PRIVATE_HEADERS } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-roles";
import { inventoryDb } from "@/lib/supabase-server";
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
    // Shared role workspaces first. Individual employee accounts (e.g. the
    // designer, who has no shared account) are appended so their sign-in is
    // reachable from this screen with one tap, without exposing passwords.
    const employeeList = await (async () => {
      try {
        const db = inventoryDb();
        const rows = await db.from("btb_employees").select("name,role,email")
          .eq("restaurant_name", BTB_RESTAURANT).eq("active", true).eq("login_enabled", true)
          .in("role", ["designer", "owner"]).order("name");
        dbError(rows.error, "");
        return (rows.data ?? []).filter((row) => !BTB_ACCOUNTS.some((account) => account.role === row.role))
          .map((row) => ({ role: row.role, email: row.email ?? "", name: row.name }));
      } catch { return []; }
    })();
    return NextResponse.json({
      authenticated: false,
      accounts: [...BTB_ACCOUNTS.map((a) => ({ role: a.role, email: a.email, name: a.name })), ...employeeList],
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
