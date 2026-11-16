import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiFailure, dbError, PRIVATE_HEADERS, requireBtbAccess } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-team";

// The restaurant comes only from this authenticated server workspace, never
// from query/body/header input. Tokens are memory-only in the browser, expire
// after ten minutes, and cannot be listed by anon/authenticated DB roles.
export async function GET() {
  try {
    const { db } = await requireBtbAccess(undefined, false, { allowLocationWorkspace: true });
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const result = await db.from("btb_public_tokens").insert({
      token_hash: createHash("sha256").update(token).digest("hex"),
      restaurant_name: BTB_RESTAURANT,
      expires_at: expiresAt,
    });
    dbError(result.error, "The workspace connection could not be authorized. Please retry.");
    return NextResponse.json({ token, expiresAt }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error); }
}
