import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_ROLE } from "@/lib/roles";
import { isProtectedPath, requiredRolesFor } from "@/lib/route-guards";
import { BTB_COOKIE, tokenValid } from "@/lib/btb-auth";
import { BTB_ADMIN_COOKIE, btbAdminClaimsFromSession } from "@/lib/btb-admin-auth";
import { btbOriginAllowed } from "@/lib/btb-origin";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Covers the legacy inventory handlers as well as btbRoute-based handlers.
  // Authorization still runs inside every API; this is an additional CSRF gate.
  if (pathname.startsWith("/api/btb/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)
      && !btbOriginAllowed(request)) {
    return NextResponse.json({ error: "Open this form in your BTB workspace and try again." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Between the Buns is a separate, cookie-gated surface — independent of the
  // green demo's Supabase auth. Its own /login and the /api/btb/* routes stay open.
  if (pathname === "/btb/login" || pathname.startsWith("/btb/login/") || pathname.startsWith("/api/btb/")) {
    return NextResponse.next();
  }
  if (pathname === "/btb/admin/login") return NextResponse.next();
  if (pathname === "/btb/admin" || pathname.startsWith("/btb/admin/")) {
    if (btbAdminClaimsFromSession(request.cookies.get(BTB_ADMIN_COOKIE)?.value)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/btb/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (pathname === "/btb/demo" || pathname.startsWith("/btb/demo/")) {
    if (tokenValid(request.cookies.get(BTB_COOKIE)?.value)) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/btb/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();

  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Trial gate: if the profile carries a trial_ends_at in the past, block.
  // trial_ends_at is added by supabase/schema-roles.sql. Databases that predate
  // that migration 400 the whole select, which would silently knock every user
  // down to the least-privileged role — so retry with a role-only projection
  // rather than lose RBAC to an optional column. Guards are unchanged either
  // way: an unreadable profile still resolves to DEFAULT_ROLE.
  let profile: { role?: string; trial_ends_at?: string | null } | null = null;
  const full = await supabase
    .from("profiles")
    .select("role, trial_ends_at")
    .eq("id", data.user.id)
    .maybeSingle();
  if (full.error) {
    const roleOnly = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    profile = roleOnly.data;
  } else {
    profile = full.data;
  }
  if (profile?.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) {
    const url = request.nextUrl.clone();
    url.pathname = "/trial-expired";
    return NextResponse.redirect(url);
  }

  const role = profile?.role ?? DEFAULT_ROLE;
  const gated = requiredRolesFor(pathname);
  if (gated && !gated.includes(role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/api/btb/:path*",
    "/dashboard/:path*",
    "/admin/:path*",
    "/checks/:path*",
    "/cleaning/:path*",
    "/temperatures/:path*",
    "/allergens/:path*",
    "/deliveries/:path*",
    "/corrective-actions/:path*",
    "/pest-control/:path*",
    "/training/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/btb/:path*",
  ],
};
