import { NextResponse } from "next/server";
import { apiFailure, requireBtbAccess } from "@/lib/btb-api";
import { btbDateWindow } from "@/lib/btb-dashboard";
import { loadBtbOverview } from "@/lib/btb-dashboard-data";
import { btbToday } from "@/lib/btb-team";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const { db, identity, access } = await requireBtbAccess(undefined, false, { allowLocationWorkspace: true });
    const day = new URL(request.url).searchParams.get("day") || btbToday();
    if (!btbDateWindow(day)) return NextResponse.json({ error: "Choose a valid dashboard date." }, { status: 400, headers });
    const signal = AbortSignal.timeout(10_000);
    const legacy = !access.locationWorkspace || ["corporate", "owner"].includes(identity.role);
    return NextResponse.json(await loadBtbOverview(db, identity.role, access.rows, day, signal, access.pageGrants, legacy), { headers });
  } catch (error) { return apiFailure(error, request); }
}
