import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  BTB_ACCOUNTS,
  BTB_COOKIE,
  btbPasswordIsDefault,
  btbPassword,
  roleFromSession,
} from "@/lib/btb-auth";

// Who is signed in to BTB (used by the hub header), plus — when signed out —
// the list of demo accounts for the login screen. The password hint is only
// ever returned while the default password is still in use; an overridden
// BTB_PASSWORD is never exposed.
export async function GET() {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);

  if (!role) {
    return NextResponse.json({
      authenticated: false,
      accounts: BTB_ACCOUNTS.map((a) => ({ role: a.role, email: a.email, name: a.name })),
      passwordHint: btbPasswordIsDefault() ? btbPassword() : null,
    });
  }

  const account = BTB_ACCOUNTS.find((a) => a.role === role)!;
  return NextResponse.json({
    authenticated: true,
    role: account.role,
    email: account.email,
    name: account.name,
    restaurant: account.restaurant,
  });
}
