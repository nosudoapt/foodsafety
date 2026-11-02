import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-redirect";

// A relative Location preserves the browser's origin and its session cookies
// even when the server sees an internal hostname behind a reverse proxy.
function redirectWithinSite(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const recovery = url.searchParams.get("flow") === "recovery";
  const code = url.searchParams.get("code");
  const destination = recovery ? "/auth/update-password" : safeNextPath(url.searchParams.get("next"));
  if (code) {
    try {
      const store = await cookies();
      const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => store.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => store.set(name, value, options)) },
      });
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return redirectWithinSite(destination);
    } catch { /* Expired or unavailable links return an actionable screen. */ }
  }
  return redirectWithinSite(recovery ? "/auth/update-password?error=expired" : "/auth/sign-in?error=confirmation");
}
