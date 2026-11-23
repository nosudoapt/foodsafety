import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, readBody } from "@/lib/btb-api";
import { isEmail } from "@/lib/btb-team";
import { INVALID_LOGIN } from "@/lib/workspace-auth-types";
import { AUTH_PRIVATE_HEADERS, createWorkspaceSession, establishSupabaseBridge, loginWorkspace, requireAuthOrigin, setWorkspaceCookie } from "@/lib/workspace-auth-server";

export async function POST(request: Request) {
  try {
    requireAuthOrigin(request);
    const body = await readBody(request, 4096);
    if (Object.keys(body).sort().join(",") !== "email,password" || typeof body.email !== "string"
      || !isEmail(body.email.trim()) || typeof body.password !== "string" || !body.password || body.password.length > 128) throw new BtbApiError(INVALID_LOGIN, 401);
    const principal = await loginWorkspace(body.email, body.password, request);
    const claims = await createWorkspaceSession(principal);
    // One sign-in, two outcomes: the durable workspace session authorizes this
    // app, and the provider cookie keeps the existing RLS pages working.
    if (principal.principalType === "supabase") await establishSupabaseBridge(body.email.trim(), body.password);
    const response = NextResponse.json({ authenticated: true, permittedView: claims.permittedView }, { headers: AUTH_PRIVATE_HEADERS });
    await setWorkspaceCookie(response, claims);
    return response;
  } catch (error) {
    if (error instanceof BtbApiError && error.status === 429) {
      const response = await apiFailure(error, request);
      response.headers.set("Retry-After", "900");
      return response;
    }
    return apiFailure(error, request);
  }
}
