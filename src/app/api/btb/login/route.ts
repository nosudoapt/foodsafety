import { NextResponse, type NextRequest } from "next/server";
import {
  BTB_COOKIE,
  BTB_COOKIE_MAX_AGE,
  accountForCredentials,
  sessionValueFor,
} from "@/lib/btb-auth";

// BTB sign-in: { email, password } against BTB's own credential list
// (src/lib/btb-auth.ts) — never Supabase. The cookie that comes back carries
// the account's role, which is what the hub filters its cards by.
export async function POST(request: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = await request.json();
    email = String(body?.email ?? body?.username ?? "");
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const account = accountForCredentials(email, password);
  if (!account) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, role: account.role, name: account.name });
  response.cookies.set(BTB_COOKIE, sessionValueFor(account.role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BTB_COOKIE_MAX_AGE,
  });
  return response;
}
