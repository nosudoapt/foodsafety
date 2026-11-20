import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, dbError, PRIVATE_HEADERS, requireBtbAccess } from "@/lib/btb-api";
import { BTB_BROWSER_TABLE_PAGES, BTB_BROWSER_RPC_PAGES, BTB_LOCATION_REFERENCE_PAGES } from "@/lib/btb-browser-scope";
import { BTB_CARDS } from "@/lib/btb-hub";
import { pageSlug } from "@/lib/btb-page-access";
import { BTB_RESTAURANT } from "@/lib/btb-team";

// A server-owned page, role, identity and read/write mode. SQL checks the live
// employee session and effective page grant on every use, not only at issuance.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const page = params.get("page");
    const mode = params.get("mode");
    const eligible = [...Object.values(BTB_BROWSER_TABLE_PAGES).flat(), ...Object.values(BTB_BROWSER_RPC_PAGES)];
    const card = BTB_CARDS.find(item => pageSlug(item) === page);
    if (!page || !eligible.includes(page) || !card || !["read", "write"].includes(mode ?? "")) throw new BtbApiError("Choose a page and access mode.");
    const { db, identity } = await requireBtbAccess(card.feature, mode === "write", { page, allowLocationWorkspace: BTB_LOCATION_REFERENCE_PAGES.some(item => item === page) });
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const result = await db.from("btb_public_tokens").insert({
      token_hash: createHash("sha256").update(token).digest("hex"),
      restaurant_name: BTB_RESTAURANT,
      expires_at: expiresAt,
      page, can_write: mode === "write", actor_role: identity.role,
      employee_id: identity.employeeId, session_version: identity.sessionVersion ?? null,
    });
    dbError(result.error, "The workspace connection could not be authorized. Please retry.");
    return NextResponse.json({ token, expiresAt }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error, request); }
}
