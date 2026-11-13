import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { inventoryDb } from "@/lib/supabase-server";
import { btbIdentityFromSession, PRIVATE_HEADERS } from "@/lib/btb-api";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { BTB_RESTAURANT } from "@/lib/btb-team";

// Page-visit tracking for "recently used / most used" chips and the owner's
// platform dashboard. Identity is resolved server-side from the session
// cookies — the client only ever sends the path, never a name.

type Actor =
  | { actorType: "user"; actorId: string; actorName: string; role: string; restaurant: string; locationId: string | null }
  | { actorType: "btb"; actorId: string; actorName: string; role: string; restaurant: string; locationId: null };

async function resolveActor(): Promise<Actor | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("name, role, restaurant_name, location_id").eq("id", user.id).maybeSingle();
    return {
      actorType: "user", actorId: user.id,
      actorName: (profile?.name as string) ?? user.email ?? "",
      role: (profile?.role as string) ?? "",
      restaurant: (profile?.restaurant_name as string) ?? "",
      locationId: (profile?.location_id as string) ?? null,
    };
  }
  const identity = await btbIdentityFromSession(cookieStore.get(BTB_COOKIE)?.value, inventoryDb());
  if (identity) {
    return {
      actorType: "btb",
      actorId: identity.employeeId ?? `btb-${identity.role}`,
      actorName: identity.name,
      role: identity.role,
      restaurant: BTB_RESTAURANT,
      locationId: null,
    };
  }
  return null;
}

export async function POST(request: Request) {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ ok: false }, { status: 401, headers: PRIVATE_HEADERS });
  let body: { path?: unknown; title?: unknown; locationId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : null;
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
  if (!path) return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });

  // Throttle: the same page revisit within 2 minutes is not a new visit.
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: recent } = await inventoryDb()
    .from("app_activity")
    .select("id")
    .eq("actor_id", actor.actorId)
    .eq("path", path)
    .gte("created_at", since)
    .limit(1);
  if (recent?.length) return NextResponse.json({ ok: true, throttled: true }, { headers: PRIVATE_HEADERS });

  const locationId = actor.locationId ?? (typeof body.locationId === "string" && body.locationId ? body.locationId : null);
  const { error } = await inventoryDb().from("app_activity").insert({
    actor_type: actor.actorType, actor_id: actor.actorId, actor_name: actor.actorName,
    role: actor.role, restaurant_name: actor.restaurant, location_id: locationId,
    path, title,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 503, headers: PRIVATE_HEADERS });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}

/** The signed-in person's own chips: 12 most recent distinct pages + the 8
 * most-visited pages over the last 30 days. */
export async function GET() {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ ok: false }, { status: 401, headers: PRIVATE_HEADERS });
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: rows, error } = await inventoryDb().from("app_activity")
    .select("path, title, created_at").eq("actor_id", actor.actorId)
    .gte("created_at", since).order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ ok: false }, { status: 503, headers: PRIVATE_HEADERS });
  return NextResponse.json({ ok: true, ...activitySummary(rows ?? []) }, { headers: PRIVATE_HEADERS });
}

type Row = { path: string; title: string; created_at: string };

/** Shared reducer: first visit = recency, count = usage. */
function activitySummary(rows: Row[]): { recent: { path: string; title: string; at: string }[]; top: { path: string; title: string; visits: number }[] } {
  const firstSeen = new Map<string, Row>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
    if (!firstSeen.has(row.path)) firstSeen.set(row.path, row);
  }
  const recent = [...firstSeen.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12)
    .map((r) => ({ path: r.path, title: r.title || r.path, at: r.created_at }));
  const top = [...counts.entries()]
    .map(([path, visits]) => ({ path, title: firstSeen.get(path)?.title || path, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8);
  return { recent, top };
}
