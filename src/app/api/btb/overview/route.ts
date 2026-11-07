import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { legacyBtbRole as roleFromSession } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { isBtbPageAccess } from "@/lib/btb-page-access";
import { btbDateWindow } from "@/lib/btb-dashboard";
import { loadBtbOverview } from "@/lib/btb-dashboard-data";
import { btbToday } from "@/lib/btb-team";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const role = await roleFromSession((await cookies()).get(BTB_COOKIE)?.value);
    if (!role) return NextResponse.json({ error: "Please sign in to open your overview." }, { status: 401, headers });
    const day = new URL(request.url).searchParams.get("day") || btbToday();
    if (!btbDateWindow(day)) return NextResponse.json({ error: "Choose a valid dashboard date." }, { status: 400, headers });
    const client = inventoryDb();
    const signal = AbortSignal.timeout(10_000);
    let access = client.from("role_page_access").select("role, page, allowed");
    if (role !== "admin") access = access.eq("role", role);
    const { data: rows, error } = await access.abortSignal(signal);
    if (error || !rows || !rows.every(isBtbPageAccess)) throw new Error("Access settings unavailable");
    return NextResponse.json(await loadBtbOverview(client, role, rows, day, signal), { headers });
  } catch {
    return NextResponse.json({ error: "The overview is unavailable. Please try again shortly." }, { status: 503, headers });
  }
}
