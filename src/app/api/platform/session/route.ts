import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { inventoryDb } from "@/lib/supabase-server";
import { PLATFORM_COOKIE, hashOf, verifyAgainst } from "@/lib/platform-admin";
import { PRIVATE_HEADERS } from "@/lib/btb-api";

// Sign in / out for the platform owner pane at /platform. Independent of both
// FoodSafe admin roles and BTB logins. The passcode lives in the database
// (platform_auth, hash only): if nothing is stored yet, the FIRST sign-in
// claims it — no environment variables needed. PLATFORM_ADMIN_PASSCODE, when
// set, overrides the DB value.

const MAX_AGE = 60 * 60 * 24 * 14; // two weeks

/** Env override first, else the single DB row's hash. */
async function storedHash(): Promise<string | null> {
  const envValue = process.env.PLATFORM_ADMIN_PASSCODE;
  if (envValue?.trim()) return hashOf(envValue.trim());
  const { data, error } = await inventoryDb().from("platform_auth").select("passcode_hash").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.passcode_hash as string) ?? null;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = await storedHash();
    const authed = !!token && cookieStore.get(PLATFORM_COOKIE)?.value === token;
    return NextResponse.json({ ok: true, authed, configured: !!token }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ ok: true, authed: false, configured: false }, { headers: PRIVATE_HEADERS });
  }
}

export async function POST(request: Request) {
  let body: { passcode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (passcode.length < 8) {
    return NextResponse.json({ ok: false, error: "Use at least 8 characters." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const stored = await storedHash();
  const result = verifyAgainst(stored, passcode);
  if (result === "wrong") {
    return NextResponse.json({ ok: false, error: "Wrong passcode." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  if (result === "claim") {
    const { error } = await inventoryDb()
      .from("platform_auth")
      .upsert({ id: 1, passcode_hash: hashOf(passcode), updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 503, headers: PRIVATE_HEADERS });
  }

  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_COOKIE, hashOf(passcode), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: MAX_AGE,
  });
  return NextResponse.json({ ok: true, claimed: result === "claim" }, { headers: PRIVATE_HEADERS });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_COOKIE);
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
