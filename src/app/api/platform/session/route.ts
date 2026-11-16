import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { inventoryDb } from "@/lib/supabase-server";
import { PLATFORM_COOKIE, hashOf, matchesBootstrapToken, verifyAgainst } from "@/lib/platform-admin";
import { apiFailure, databaseFailure, dbError, PRIVATE_HEADERS, requireBtbOrigin } from "@/lib/btb-api";

// Sign in / out for the platform owner pane at /platform. Independent of both
// FoodSafe admin roles and BTB logins. The passcode lives in the database
// (platform_auth, hash only): PLATFORM_ADMIN_PASSCODE, when set, overrides the
// DB value. A first passcode may only be claimed by presenting the one-time
// PLATFORM_ADMIN_BOOTSTRAP_TOKEN from the server environment — there is no
// anonymous claim (HTTP-05).

const MAX_AGE = 60 * 60 * 24 * 14; // two weeks

/** Env override first, else the single DB row's hash. */
async function storedHash(): Promise<string | null> {
  const envValue = process.env.PLATFORM_ADMIN_PASSCODE;
  if (envValue?.trim()) return hashOf(envValue.trim());
  const { data, error } = await inventoryDb().from("platform_auth").select("passcode_hash").eq("id", 1).maybeSingle();
  dbError(error, "Platform sign-in could not be verified. Please retry.");
  return (data?.passcode_hash as string) ?? null;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = await storedHash();
    const authed = !!token && cookieStore.get(PLATFORM_COOKIE)?.value === token;
    return NextResponse.json({ ok: true, authed, configured: !!token }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    await apiFailure(error, undefined, "platform");
    return NextResponse.json({ ok: true, authed: false, configured: false }, { headers: PRIVATE_HEADERS });
  }
}

export async function POST(request: Request) {
  try { requireBtbOrigin(request); return await signIn(request); }
  catch (error) { return apiFailure(error, request, "platform"); }
}

async function signIn(request: Request) {
  let body: { passcode?: unknown; bootstrapToken?: unknown };
  try {
    body = (await request.json()) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid form");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (passcode.length < 8 || passcode.length > 256) {
    return NextResponse.json({ ok: false, error: "Use 8 to 256 characters." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const stored = await storedHash();
  const result = verifyAgainst(stored, passcode);
  if (result === "claim") {
    // HTTP-05: without a stored passcode, the claim must present the one-time
    // bootstrap token from the environment. Anonymous claiming is refused.
    if (!matchesBootstrapToken(typeof body.bootstrapToken === "string" ? body.bootstrapToken : null)) {
      return NextResponse.json({ ok: false, error: "Platform access is not configured. Ask the owner to set PLATFORM_ADMIN_BOOTSTRAP_TOKEN." }, { status: 403, headers: PRIVATE_HEADERS });
    }
    const { error } = await inventoryDb()
      .from("platform_auth")
      .insert({ id: 1, passcode_hash: hashOf(passcode), updated_at: new Date().toISOString() });
    // The singleton primary key is the atomic claim, not the earlier read. A
    // concurrent loser must never overwrite the winner or receive a cookie.
    if (error?.code === "23505") {
      return NextResponse.json({ ok: false, error: "Platform access was just configured. Sign in with the owner's chosen passcode." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    if (error) return databaseFailure(error, "The platform passcode could not be saved. Please try again.", 503, "platform");
  } else if (result === "wrong") {
    return NextResponse.json({ ok: false, error: "Wrong passcode." }, { status: 401, headers: PRIVATE_HEADERS });
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
