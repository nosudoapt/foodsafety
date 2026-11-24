import { NextResponse } from "next/server";
import { apiFailure, btbRequestLocation, requireBtbAccess } from "@/lib/btb-api";
import { btbDateWindow } from "@/lib/btb-dashboard";
import { loadBtbOverview } from "@/lib/btb-dashboard-data";
import { btbToday } from "@/lib/btb-team";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const context = await requireBtbAccess(undefined, false, { allowLocationWorkspace: true });
    const { db, identity, access } = context;
    const day = new URL(request.url).searchParams.get("day") || btbToday();
    if (!btbDateWindow(day)) return NextResponse.json({ error: "Choose a valid dashboard date." }, { status: 400, headers });
    const signal = AbortSignal.timeout(10_000);
    const location = await btbRequestLocation(context, request);
    // A console inside a branch reads that branch's figures only; the same view
    // it had in the console (group-wide) is not what a branch workspace shows.
    const branchConsole = identity.console === true;
    return NextResponse.json(await loadBtbOverview(db, identity.role, access.rows, day, signal, access.pageGrants, branchConsole, location!.id, branchConsole), { headers });
  } catch (error) { return apiFailure(error, request); }
}
