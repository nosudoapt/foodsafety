import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, dbError, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import { serviceDb } from "@/lib/supabase-server";
import { requireWorkspaceSession } from "@/lib/workspace-auth-server";

/** Your own profile. Display fields only — role, tenant and location are decided
 * by the server (and the profile trigger refuses browser writes to them), so this
 * endpoint can never be used to promote anyone. */
const COLUMNS = "id, email, full_name, restaurant_name, role, created_at, updated_at";
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

function ownProfile(session: Awaited<ReturnType<typeof requireWorkspaceSession>>) {
  if (session.claims.principalType !== "supabase") throw new BtbApiError("This page is for restaurant accounts.", 403);
  return session.principal.credentialId;
}

export async function GET(request: Request) {
  try {
    const session = await requireWorkspaceSession();
    const id = ownProfile(session);
    const result = await serviceDb().from("profiles").select(COLUMNS).eq("id", id).maybeSingle();
    dbError(result.error, "Your profile could not be loaded. Please retry.");
    if (!result.data) throw new BtbApiError("Your profile could not be found.", 404);
    return NextResponse.json({
      profile: result.data,
      tenant: { id: session.claims.tenantId, name: session.principal.tenantName, slug: session.claims.tenantSlug },
      location: session.principal.locations.find((site) => site.id === session.claims.locationId) ?? null,
    }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request); }
}

export async function POST(request: Request) {
  try {
    requireBtbOrigin(request);
    const session = await requireWorkspaceSession();
    const id = ownProfile(session);
    const body = await readBody(request, 4096);
    const fullName = text(body.fullName, 120);
    const restaurantName = text(body.restaurantName, 120);
    if (!fullName) throw new BtbApiError("Enter your name.");

    const saved = await serviceDb().from("profiles")
      .update({ full_name: fullName, ...(restaurantName ? { restaurant_name: restaurantName } : {}), updated_at: new Date().toISOString() })
      .eq("id", id).select(COLUMNS).maybeSingle();
    dbError(saved.error, "Your profile could not be saved. Please retry.");
    if (!saved.data) throw new BtbApiError("Your profile could not be found.", 404);
    return NextResponse.json({ ok: true, profile: saved.data }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request); }
}
