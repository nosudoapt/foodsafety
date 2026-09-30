import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_ROLE } from "@/lib/roles";
import { isProtectedPath, requiredRolesFor } from "@/lib/route-guards";
import { BTB_COOKIE, tokenValid } from "@/lib/btb-auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Between the Buns is a separate, cookie-gated surface — independent of the
  // green demo's Supabase auth. Its own /login and the /api/btb/* routes stay open.
  if (pathname === "/between-the-buns/login" || pathname.startsWith("/api/btb/")) {
    return NextResponse.next();
  }
  if (pathname === "/between-the-buns" || pathname.startsWith("/between-the-buns/")) {
    if (tokenValid(request.cookies.get(BTB_COOKIE)?.value)) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/between-the-buns/login";
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
    "/between-the-buns/:path*",
  ],
};
