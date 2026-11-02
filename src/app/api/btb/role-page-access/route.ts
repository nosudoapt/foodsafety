import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { verifiedBtbRole as roleFromSession } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { validateAccessChanges } from "@/lib/btb-page-access";

// Role → page access matrix the BTB hub reads. Any signed-in role may read it
// (the hub uses it to show/hide cards); only admin may change it. The GET used
// to have NO cookie check at all — anyone could read the matrix unauthenticated.

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const cookieStore = await cookies();
    const role = await roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
    if (!role) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401, headers });
    let query = inventoryDb().from("role_page_access").select("role, page, allowed");
    if (role !== "admin") query = query.eq("role", role);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(10_000));
    if (error) throw error;
    return NextResponse.json({ rows: data ?? [] }, { headers });
  } catch {
    return NextResponse.json({ error: "Page access settings are unavailable. Please try again." }, { status: 503, headers });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const role = await roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
    if (role !== "admin") return NextResponse.json({ error: "Only an administrator can change page access." }, { status: role ? 403 : 401, headers });
    const rows = validateAccessChanges(await req.json().catch(() => null));
    if (!rows) return NextResponse.json({ error: "Choose valid pages and permissions within each role’s access level." }, { status: 400, headers });
    // One atomic upsert, rather than one request per checkbox. Success is only
    // reported after every changed permission has been persisted.
    const { error } = await inventoryDb().from("role_page_access").upsert(rows, { onConflict: "role,page" }).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw error;
    return NextResponse.json({ ok: true, rows }, { headers });
  } catch {
    return NextResponse.json({ error: "Your access changes could not be saved. Please try again." }, { status: 503, headers });
  }
}
