import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, PRIVATE_HEADERS } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { dispatchLicenceReminders } from "@/lib/btb-reminder-service";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) throw new BtbApiError("The reminder scheduler is not configured.", 503);
    const received = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new BtbApiError("Unauthorized scheduler request.", 401);
    return NextResponse.json(await dispatchLicenceReminders(inventoryDb(), { limit: 300, budgetMs: 270_000 }), { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error); }
}
