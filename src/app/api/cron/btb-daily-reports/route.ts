import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, PRIVATE_HEADERS } from "@/lib/btb-api";
import { dispatchDailyEmails } from "@/lib/btb-email-worker";
import { inventoryDb } from "@/lib/supabase-server";

// Same contract as the licence reminder scheduler: a secret bearer token,
// a strict time budget, and an honest per-kind run summary.
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) throw new BtbApiError("The report scheduler is not configured.", 503);
    const received = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new BtbApiError("Unauthorized scheduler request.", 401);
    }
    const run = await dispatchDailyEmails(inventoryDb(), { limit: 30, budgetMs: 240_000 });
    return NextResponse.json(run, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return apiFailure(error);
  }
}
