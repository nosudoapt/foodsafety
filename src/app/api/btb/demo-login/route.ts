import { NextResponse } from "next/server";
import { BtbApiError, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { btbDemoSlug } from "@/lib/btb-demo";
import { BTB_ACCOUNTS, BTB_COOKIE, BTB_COOKIE_MAX_AGE, BtbConfigurationError, accountForCredentials, sessionValueFor } from "@/lib/btb-auth";
import { isEmail } from "@/lib/btb-team";

// Hidden demo door. Only the server-configured BTB_DEMO_SLUG reaches this
// endpoint, and only the five shared role accounts can sign in here. The live
// team login (/api/btb/login) stays employee-only.
function requestedSlug(request: Request): string | null {
  return new URL(request.url).searchParams.get("slug")?.trim().toLowerCase() ?? null;
}

export async function GET(request: Request) {
  const demoSlug = btbDemoSlug();
  if (!demoSlug || requestedSlug(request) !== demoSlug) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE_HEADERS });
  }
  return NextResponse.json({
    slug: demoSlug,
    accounts: BTB_ACCOUNTS.map(({ role, email, name }) => ({ role, email, name })),
  }, { headers: PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  try {
    requireBtbOrigin(request, "Open the demo from its own sign-in page.");
    const demoSlug = btbDemoSlug();
    if (!demoSlug) throw new BtbApiError("The demo workspace is not configured.", 404);
    const body = await readBody(request, 4096);
    const slug = String(body.slug ?? "").trim().toLowerCase();
    if (slug !== demoSlug) throw new BtbApiError("Not found", 404);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!isEmail(email) || !password || password.length > 128) throw new BtbApiError("Invalid email or password", 401);
    const account = accountForCredentials(email, password);
    if (!account) throw new BtbApiError("Invalid email or password", 401);
    const response = NextResponse.json({ ok: true, role: account.role, name: account.name, slug: demoSlug }, { headers: PRIVATE_HEADERS });
    response.cookies.set(BTB_COOKIE, sessionValueFor(account.role), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: BTB_COOKIE_MAX_AGE,
    });
    response.cookies.set("btb_slug", demoSlug, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: BTB_COOKIE_MAX_AGE,
    });
    return response;
  } catch (error) {
    if (error instanceof BtbConfigurationError) {
      return NextResponse.json({ error: "The demo backend is unavailable. Please try again." }, { status: 503, headers: PRIVATE_HEADERS });
    }
    if (error instanceof BtbApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ error: "The demo could not sign in. Please try again." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
