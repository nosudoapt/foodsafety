import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { inventoryDb } from "@/lib/supabase-server";
import { apiFailure, BtbApiError, dbError, PRIVATE_HEADERS, readBody, requireBtbAccess, requireBtbOrigin } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-roles";
import { friendlyPathTitle } from "@/lib/page-titles";
import { activityLocationId, activityPath, activityPathInWorkspace, activitySummary, btbActivityPathAllowed, canonicalBtbActivityPath, type ActivityRow, type ActivityWorkspace } from "@/lib/activity";
import type { BtbEffectiveAccess } from "@/lib/btb-page-access";

// Page-visit tracking for "recently used / most used" chips and the owner's
// platform dashboard. Identity is resolved server-side from the session
// cookies — the client only ever sends the path, never a name.

type Actor = { actorType: "user" | "btb"; actorId: string; actorName: string; role: string; restaurant: string; locationId: string | null; access?: BtbEffectiveAccess };

function workspaceFromRequest(request: Request): ActivityWorkspace {
  const workspace = new URL(request.url).searchParams.get("workspace") ?? "foodsafe";
  if (workspace !== "btb" && workspace !== "foodsafe") throw new BtbApiError("Choose a valid workspace.");
  return workspace;
}

async function resolveActor(workspace: ActivityWorkspace): Promise<Actor | null> {
  if (workspace === "btb") {
    const { identity, access } = await requireBtbAccess();
    return {
      actorType: "btb", actorId: identity.employeeId ?? `btb-${identity.role}`,
      actorName: identity.name, role: identity.role, restaurant: BTB_RESTAURANT,
      locationId: activityLocationId(identity.employeeId, access.locationIds), access,
    };
  }
  // FoodSafe remains the default, with no fallback to a simultaneous BTB cookie.
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile, error } = await supabase.from("profiles").select("name, role, restaurant_name, location_id").eq("id", user.id).maybeSingle();
    dbError(error, "Your activity profile could not be verified. Please retry.");
    if (!profile?.restaurant_name?.trim()) return null;
    return {
      actorType: "user", actorId: user.id,
      actorName: (profile?.name as string) ?? user.email ?? "",
      role: (profile?.role as string) ?? "",
      restaurant: (profile?.restaurant_name as string) ?? "",
      locationId: (profile?.location_id as string) ?? null,
    };
  }
  return null;
}

export async function POST(request: Request) {
  try {
  requireBtbOrigin(request, "Open this page in your workspace and try again.");
  const workspace = workspaceFromRequest(request);
  const actor = await resolveActor(workspace);
  if (!actor) return NextResponse.json({ ok: false }, { status: 401, headers: PRIVATE_HEADERS });
  const body = await readBody(request, 4096);
  const supplied = activityPath(body.path);
  const path = supplied && workspace === "btb" ? canonicalBtbActivityPath(supplied) : supplied;
  if (!path) return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  if (!activityPathInWorkspace(path, workspace) || actor.access && !btbActivityPathAllowed(path, actor.access)) {
    throw new BtbApiError("This page is not enabled in your workspace.", 403);
  }
  // The stored title comes from the path, not the browser tab — page titles
  // are unreliable (several products share one generic tagline).
  const title = friendlyPathTitle(path);

  // Throttle: the same page revisit within 2 minutes is not a new visit.
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: recent, error: recentError } = await inventoryDb()
    .from("app_activity")
    .select("id")
    .eq("actor_id", actor.actorId)
    .eq("actor_type", actor.actorType)
    .eq("restaurant_name", actor.restaurant)
    .eq("path", path)
    .gte("created_at", since)
    .limit(1);
  dbError(recentError, "Your recent activity could not be checked.");
  if (recent?.length) return NextResponse.json({ ok: true, throttled: true }, { headers: PRIVATE_HEADERS });

  const { error } = await inventoryDb().from("app_activity").insert({
    actor_type: actor.actorType, actor_id: actor.actorId, actor_name: actor.actorName,
    role: actor.role, restaurant_name: actor.restaurant, location_id: actor.locationId,
    path, title,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 503, headers: PRIVATE_HEADERS });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request, "activity"); }
}

/** The signed-in person's own chips: 12 most recent distinct pages + the 8
 * most-visited pages over the last 30 days. */
export async function GET(request: Request) {
  try {
  const workspace = workspaceFromRequest(request);
  const actor = await resolveActor(workspace);
  if (!actor) return NextResponse.json({ ok: false }, { status: 401, headers: PRIVATE_HEADERS });
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: rows, error } = await inventoryDb().from("app_activity")
    .select("path, title, created_at").eq("actor_id", actor.actorId)
    .eq("actor_type", actor.actorType).eq("restaurant_name", actor.restaurant)
    .gte("created_at", since).order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ ok: false }, { status: 503, headers: PRIVATE_HEADERS });
  const visible = (rows ?? []).flatMap((row: ActivityRow) => {
    const path = workspace === "btb" ? canonicalBtbActivityPath(row.path) : activityPath(row.path);
    return path && activityPathInWorkspace(path, workspace) && (!actor.access || btbActivityPathAllowed(path, actor.access)) ? [{ ...row, path }] : [];
  });
  return NextResponse.json({ ok: true, ...activitySummary(visible) }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request, "activity"); }
}
