import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { inventoryDb } from "@/lib/supabase-server";
import { PLATFORM_COOKIE } from "@/lib/platform-admin";
import { PRIVATE_HEADERS } from "@/lib/btb-api";

// The platform pane's data: every client (restaurant) — BTB and FoodSafe alike
// — with usage, storage, heatmap and the pricing game. Platform cookie only,
// verified against the passcode hash stored in platform_auth.

async function hasSession(cookieValue: string | undefined | null): Promise<boolean> {
  const envValue = process.env.PLATFORM_ADMIN_PASSCODE;
  let expected = envValue?.trim() ? createHash("sha256").update(envValue.trim()).digest("hex") : null;
  if (!expected) {
    const { data } = await inventoryDb().from("platform_auth").select("passcode_hash").eq("id", 1).maybeSingle();
    expected = (data?.passcode_hash as string) ?? null;
  }
  if (!expected || !cookieValue) return false;
  return cookieValue === expected;
}

const gb = (n: number) => Math.round((n / 1_073_741_824) * 100) / 100;
const bytes = (n: number | null | undefined) => n ?? 0;

export async function GET() {
  const cookieStore = await cookies();
  if (!(await hasSession(cookieStore.get(PLATFORM_COOKIE)?.value))) {
    return NextResponse.json({ ok: false }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const db = inventoryDb();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [activity, plans, locations, storageDocs, storageLicenses, storagePromos, storageManuals, fileObjects, aiUsage, employees] = await Promise.all([
    db.from("app_activity").select("restaurant_name, location_id, path, title, role, actor_id, actor_name, created_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(20_000),
    db.from("platform_plans").select("*"),
    db.from("locations").select("id, name, address, created_at"),
    db.from("business_documents").select("restaurant_name, file_size"),
    db.from("staff_licenses").select("restaurant_name, file_size"),
    db.from("marketing_promotions").select("restaurant_name, file_size"),
    db.from("print_manuals").select("restaurant_name, file_size"),
    db.from("btb_file_objects").select("location_id, byte_size"),
    db.from("btb_ai_usage").select("location_id, used_count, day").gte("day", since.slice(0, 10)),
    db.from("btb_employees").select("restaurant_name, active"),
  ]);

  const errs = [activity, plans, locations, storageDocs, storageLicenses, storagePromos, storageManuals, fileObjects, aiUsage, employees]
    .map((r) => r.error).filter(Boolean);
  if (errs.length) {
    return NextResponse.json({ ok: false, error: errs[0]!.message }, { status: 503, headers: PRIVATE_HEADERS });
  }

  const rows = activity.data ?? [];
  const plansById = new Map((plans.data ?? []).map((p: Record<string, unknown>) => [p.restaurant_name as string, p]));

  // Heatmap: last 30 days × 24 hours, all clients combined.
  const heatmap: number[][] = Array.from({ length: 30 }, () => Array(24).fill(0));
  const dayIndex = new Map<string, number>();
  const today = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    dayIndex.set(d.toISOString().slice(0, 10), 29 - i);
  }
  for (const row of rows) {
    const day = String(row.created_at).slice(0, 10);
    const di = dayIndex.get(day);
    if (di !== undefined) heatmap[di][new Date(row.created_at).getHours()] += 1;
  }

  // Storage per client — the file-bearing tables' sizes plus BTB's inline
  // file objects.
  const storageByRestaurant = new Map<string, number>();
  const addBytes = (list: { restaurant_name?: string; file_size?: number | null }[] | null) => {
    for (const row of list ?? []) {
      const key = row.restaurant_name || "unknown";
      storageByRestaurant.set(key, (storageByRestaurant.get(key) ?? 0) + bytes(row.file_size));
    }
  };
  addBytes(storageDocs.data ?? []);
  addBytes(storageLicenses.data ?? []);
  addBytes(storagePromos.data ?? []);
  addBytes(storageManuals.data ?? []);

  const clients = new Map<string, {
    restaurant_name: string; views30d: number; activeUsers: number; users: string[];
    topPages: { path: string; visits: number }[]; lastSeen: string | null;
  }>();
  for (const row of rows) {
    const key = row.restaurant_name || "unknown";
    let client = clients.get(key);
    if (!client) {
      client = { restaurant_name: key, views30d: 0, activeUsers: 0, users: [], topPages: [], lastSeen: null };
      clients.set(key, client);
    }
    client.views30d += 1;
    if (!client.users.includes(row.actor_id)) client.users.push(row.actor_id);
    if (!client.lastSeen || row.created_at > client.lastSeen) client.lastSeen = row.created_at;
    const page = client.topPages.find((p) => p.path === row.path);
    if (page) page.visits += 1;
    else client.topPages.push({ path: row.path, visits: 1 });
  }

  const btbFileBytes = (fileObjects.data ?? []).reduce((sum: number, f: Record<string, unknown>) => sum + bytes(f.byte_size as number), 0);
  const aiTotal = (aiUsage.data ?? []).reduce((sum: number, u: Record<string, unknown>) => sum + Number(u.used_count ?? 0), 0);
  const clientList = [...clients.values()].map((client) => {
    const plan = plansById.get(client.restaurant_name);
    const clientBytes = (storageByRestaurant.get(client.restaurant_name) ?? 0)
      + (client.restaurant_name === "Between the Buns" ? btbFileBytes : 0);
    return {
      restaurant_name: client.restaurant_name,
      views30d: client.views30d,
      activeUsers: client.users.length,
      topPages: client.topPages.sort((a, b) => b.visits - a.visits).slice(0, 5),
      lastSeen: client.lastSeen,
      storageBytes: gb(clientBytes),
      aiCalls30d: client.restaurant_name === "Between the Buns" ? aiTotal : undefined,
      plan: (plan?.plan as string) ?? "standard",
      seats: Number(plan?.seats ?? 0),
      monthlyPrice: Number(plan?.monthly_price ?? 0),
    };
  }).sort((a, b) => b.views30d - a.views30d);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    totals: {
      clients: clientList.length,
      views30d: rows.length,
      activeUsers: new Set(rows.map((r) => r.actor_id)).size,
      storageBytes: gb([...storageByRestaurant.values()].reduce((a, b) => a + b, 0) + btbFileBytes),
      mrr: clientList.reduce((sum, c) => sum + c.monthlyPrice, 0),
      seats: clientList.reduce((sum, c) => sum + c.seats, 0),
    },
    heatmap,
    clients: clientList,
    locations: locations.data ?? [],
  }, { headers: PRIVATE_HEADERS });
}

/** Owner edits a client's plan/seats/price — the "pricing game". */
export async function PUT(request: Request) {
  const cookieStore = await cookies();
  if (!(await hasSession(cookieStore.get(PLATFORM_COOKIE)?.value))) {
    return NextResponse.json({ ok: false }, { status: 401, headers: PRIVATE_HEADERS });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const restaurantName = typeof body.restaurant_name === "string" ? body.restaurant_name.trim().slice(0, 120) : "";
  if (!restaurantName) return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  const row = {
    restaurant_name: restaurantName,
    plan: typeof body.plan === "string" ? body.plan.slice(0, 40) : "standard",
    seats: Number.isFinite(Number(body.seats)) ? Math.max(0, Math.floor(Number(body.seats))) : 0,
    monthly_price: Number.isFinite(Number(body.monthly_price)) ? Math.max(0, Number(body.monthly_price)) : 0,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : "",
    updated_at: new Date().toISOString(),
  };
  const { error } = await inventoryDb().from("platform_plans").upsert(row, { onConflict: "restaurant_name" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 503, headers: PRIVATE_HEADERS });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
