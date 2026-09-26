import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { MGMT_ROLES, OWNER_TIER_ROLES } from "@/lib/roles";

// Server-side RBAC for /admin subroutes (mirrors the nav tiers in
// src/app/admin/layout.tsx — client nav hides these, this enforces them).
// Anything not listed here is admin-shell content open to all signed-in staff.
const MGMT = MGMT_ROLES as string[];
const OWNER = OWNER_TIER_ROLES as string[];
const ADMIN_ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin/vault", roles: OWNER },
  { prefix: "/admin/new-restaurant", roles: OWNER },
  { prefix: "/admin/compliance", roles: MGMT },
  { prefix: "/admin/documents", roles: MGMT },
  { prefix: "/admin/staff-licenses", roles: MGMT },
  { prefix: "/admin/marketing", roles: [...MGMT, "designer"] },
  { prefix: "/admin/inspections", roles: MGMT },
  { prefix: "/admin/manuals", roles: MGMT },
];

// Routes that require an authenticated session. BTB staff pages
// (/between-the-buns/*) are intentionally public for shared tablets.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/admin",
  "/checks",
  "/cleaning",
  "/temperatures",
  "/allergens",
  "/deliveries",
  "/corrective-actions",
  "/pest-control",
  "/training",
  "/reports",
  "/settings",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!needsAuth) return NextResponse.next();

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
  const { data: profile } = await supabase
    .from("profiles")
    .select("trial_ends_at, role")
    .eq("id", data.user.id)
    .single();
  if (profile?.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) {
    const url = request.nextUrl.clone();
    url.pathname = "/trial-expired";
    return NextResponse.redirect(url);
  }

  // Enforce admin subroute RBAC server-side (client nav only hides links).
  const role = profile?.role ?? "staff";
  const gated = ADMIN_ROUTE_ROLES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
  if (gated && !gated.roles.includes(role)) {
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
  ],
};
