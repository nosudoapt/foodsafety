import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/route-guards";
import { workspacePageAllowed, pathWithin } from "@/lib/workspace-page-access";
import { workspaceSessionFromValue, AUTH_PRIVATE_HEADERS } from "@/lib/workspace-auth-server";
import { WORKSPACE_COOKIE } from "@/lib/workspace-auth-types";
import { btbOriginAllowed } from "@/lib/btb-origin";

/** URLs and headers are routing hints, never identity/location authorities.
 * Leaf pages and APIs independently verify the same live, revocable session. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  for (const name of ["x-btb-slug", "x-workspace-path", "x-workspace-session"]) requestHeaders.delete(name);

  // The matcher is a catch-all so no new route can silently skip the gate; build
  // output and files are the only things that never need a session check.
  if (/^\/(?:_next\/|favicon\.ico$)/.test(path) || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|pdf)$/.test(path)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathWithin(path, "/api")) {
    if (!pathWithin(path, "/api/cron") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !btbOriginAllowed(request)) {
      return NextResponse.json({ error: "Open this form on this site and try again." }, { status: 403, headers: AUTH_PRIVATE_HEADERS });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const retiredDoor = path === "/btb/login" || path === "/btb/admin/login" || path === "/btb/demo-login"
    || /^\/btb\/[^/]+\/login\/?$/.test(path);
  const chooser = path === "/app" || path === "/btb" || path === "/platform";
  const legacyFolder = pathWithin(path, "/btb/demo");
  const protectedPage = isProtectedPath(path) || pathWithin(path, "/btb") || path === "/trial-expired";
  const publicAuthPage = path === "/auth/sign-in" || path === "/auth/set-password";
  if (!retiredDoor && !chooser && !protectedPage && !publicAuthPage) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  // No slug lookup happens until the credential/session has been verified.
  let session;
  try { session = await workspaceSessionFromValue(request.cookies.get(WORKSPACE_COOKIE)?.value); }
  catch {
    return new NextResponse("Your workspace could not be verified. Please retry.", { status: 503, headers: AUTH_PRIVATE_HEADERS });
  }
  const redirectTo = (target: string) => NextResponse.redirect(new URL(target, request.url));
  if (retiredDoor) return redirectTo(session?.claims.permittedView ?? "/auth/sign-in");
  if (path === "/auth/sign-in") return session ? redirectTo(session.claims.permittedView) : NextResponse.next({ request: { headers: requestHeaders } });
  if (!session) return chooser && path === "/app" ? NextResponse.next({ request: { headers: requestHeaders } }) : redirectTo("/auth/sign-in");
  const { claims } = session;
  if (chooser || legacyFolder) return redirectTo(claims.permittedView);
  if (!workspacePageAllowed(path, claims)) return redirectTo(claims.permittedView);

  requestHeaders.set("x-workspace-path", path);
  if (claims.principalType === "employee") {
    const site = session.principal.locations.find(item => item.id === claims.locationId)!;
    const rest = path.slice(claims.permittedView.length);
    const url = request.nextUrl.clone();
    url.pathname = `/btb/demo${rest}`;
    requestHeaders.set("x-btb-slug", site.slug);
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/:path*"],
};
