import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_ROLE } from "@/lib/roles";
import { isProtectedPath, requiredRolesFor } from "@/lib/route-guards";
import { BTB_COOKIE, tokenValid } from "@/lib/btb-auth";
import { BTB_ADMIN_COOKIE, btbAdminClaimsFromSession } from "@/lib/btb-admin-auth";
import { btbDemoSlug } from "@/lib/btb-demo";
import { btbOriginAllowed } from "@/lib/btb-origin";

// A tiny in-instance cache so a location page does not hit PostgREST on every
// asset/navigation request. Unknown slugs are refused before any rewrite, so a
// typo returns a real 404 instead of rendering someone else's workspace shell.
const slugCache = new Map<string, { ok: boolean; at: number }>();

async function locationSlugExists(slug: string): Promise<boolean> {
  const cached = slugCache.get(slug);
  if (cached && Date.now() - cached.at < 60_000) return cached.ok;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base || !key) return true; // Layout validation still runs as a fallback.
  try {
    const response = await fetch(`${base}/rest/v1/locations?select=slug&slug=eq.${encodeURIComponent(slug)}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4_000),
    });
    const rows: unknown = response.ok ? await response.json() : [];
    const ok = Array.isArray(rows) && rows.length > 0;
    slugCache.set(slug, { ok, at: Date.now() });
    return ok;
  } catch { return true; } // Never lock people out because Supabase blipped.
}

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
  // green demo's Supabase auth. Sign-in, the hidden demo door and the API stay
  // public; everything else is rewritten from /btb/<location-slug> to the
  // existing workspace pages without exposing the folder name in the URL.
  if (pathname === "/btb/login" || pathname.startsWith("/btb/login/")
    || pathname === "/btb/demo-login" || pathname.startsWith("/api/btb/")) {
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

  const demoSlug = btbDemoSlug();
  const session = request.cookies.get(BTB_COOKIE)?.value;
  const signedIn = tokenValid(session);
  const shared = signedIn && !session!.startsWith("employee.");

  const loginMatch = pathname.match(/^\/btb\/([^/]+)\/login\/?$/);
  if (loginMatch) {
    const url = request.nextUrl.clone();
    if (demoSlug && loginMatch[1] === demoSlug) {
      url.pathname = "/btb/demo-login";
      const headers = new Headers(request.headers);
      headers.set("x-btb-slug", demoSlug);
      return NextResponse.rewrite(url, { request: { headers } });
    }
    url.pathname = "/btb/login";
    return NextResponse.redirect(url);
  }

  // The old folder name is only an internal detail. It must never disclose the
  // hidden demo slug: signed-in people are sent to their own saved location
  // (the shared demo session to the demo), and strangers go to the team login.
  if (pathname === "/btb/demo" || pathname.startsWith("/btb/demo/")) {
    const rest = pathname.slice("/btb/demo".length);
    if (signedIn) {
      if (!demoSlug) return NextResponse.next();
      const saved = request.cookies.get("btb_slug")?.value;
      const target = shared ? demoSlug : saved;
      const url = request.nextUrl.clone();
      if (!target) {
        url.pathname = "/btb";
        return NextResponse.redirect(url);
      }
      url.pathname = `/btb/${target}${rest}`;
      return NextResponse.redirect(url, 307);
    }
    const url = request.nextUrl.clone();
    url.pathname = "/btb/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/btb" || pathname.startsWith("/btb/")) {
    if (pathname === "/btb") {
      const url = request.nextUrl.clone();
      const saved = request.cookies.get("btb_slug")?.value;
      const target = shared ? demoSlug : saved;
      if (!signedIn || !target) {
        url.pathname = "/btb/login";
        return NextResponse.redirect(url);
      }
      url.pathname = `/btb/${target}`;
      return NextResponse.redirect(url);
    }
    const match = pathname.match(/^\/btb\/([^/]+)(\/.*)?$/);
    const slug = match?.[1] ?? "";
    const rest = match?.[2] ?? "";
    if (!signedIn || !slug) {
      const url = request.nextUrl.clone();
      // The hidden demo has its own shared-account door.
      url.pathname = demoSlug && slug === demoSlug ? `/btb/${demoSlug}/login` : "/btb/login";
      if (pathname !== "/btb") url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
    if (slug !== demoSlug && !(await locationSlugExists(slug))) {
      return new NextResponse("Location not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    // Shared store accounts only exist behind the hidden demo door. An employee
    // session may open any assigned location; Phase 1 resolves the URL only.
    if (shared && slug !== demoSlug) {
      if (!demoSlug) return NextResponse.redirect(new URL("/btb/login", request.url));
      const url = request.nextUrl.clone();
      url.pathname = `/btb/${demoSlug}${rest}`;
      return NextResponse.redirect(url, 307);
    }
    const url = request.nextUrl.clone();
    url.pathname = `/btb/demo${rest}`;
    const headers = new Headers(request.headers);
    headers.set("x-btb-slug", slug);
    // Cookies are the one request input a Server Component can always read;
    // inject the resolved slug for this render as well as for the next request.
    // Replace any stale slug: browsers send the previous location cookie, and a
    // duplicate name would make the server read the old location.
    const rawCookie = (headers.get("cookie") ?? "").replace(/(?:^|;\s*)btb_slug=[^;]*/g, "").replace(/;\s*$/, "");
    headers.set("cookie", `${rawCookie ? `${rawCookie}; ` : ""}btb_slug=${slug}`);
    const response = NextResponse.rewrite(url, { request: { headers } });
    response.cookies.set("btb_slug", slug, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
    });
    return response;
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
