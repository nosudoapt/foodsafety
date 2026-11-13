import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { PLATFORM_COOKIE, platformPasscode, platformToken } from "@/lib/platform-admin";
import { PRIVATE_HEADERS } from "@/lib/btb-api";

// Sign in / out for the platform owner pane at /platform. Independent of both
// FoodSafe admin roles and BTB logins — one passcode from the environment.

const MAX_AGE = 60 * 60 * 24 * 14; // two weeks

export async function GET() {
  const cookieStore = await cookies();
  const token = platformToken();
  const authed = !!token && cookieStore.get(PLATFORM_COOKIE)?.value === token;
  return NextResponse.json({ ok: true, authed, configured: !!platformPasscode() }, { headers: PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  const passcode = platformPasscode();
  if (!passcode) {
    return NextResponse.json({ ok: false, error: "Platform access isn't configured (PLATFORM_ADMIN_PASSCODE)." }, { status: 503, headers: PRIVATE_HEADERS });
  }
  let body: { passcode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const given = Buffer.from(typeof body.passcode === "string" ? createHash("sha256").update(body.passcode).digest("hex") : "");
  const expected = Buffer.from(createHash("sha256").update(passcode).digest("hex"));
  const match = given.length === expected.length && timingSafeEqual(given, expected);
  if (!match) return NextResponse.json({ ok: false, error: "Wrong passcode." }, { status: 401, headers: PRIVATE_HEADERS });

  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_COOKIE, platformToken()!, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: MAX_AGE,
  });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_COOKIE);
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
