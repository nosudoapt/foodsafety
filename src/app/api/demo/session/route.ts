import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { demoCredentialsFor } from "@/lib/demo-server";

// One-click demo sign-in: { role } in, Supabase session cookies out.
//
// The password is resolved server-side (DEMO_PASSWORD env) so the client only
// ever sends a role — nothing secret ships to the browser. This route is
// deliberately outside src/proxy.ts's matcher (page paths only), so there is no
// redirect loop, and it grants nothing the regular sign-in form does not: the
// session it creates still goes through the exact same server-side RBAC in
// proxy.ts on every gated page request.
export async function POST(request: NextRequest) {
  let role = "";
  try {
    const body = await request.json();
    role = String(body?.role ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const credentials = demoCredentialsFor(role);
  if (!credentials) {
    return NextResponse.json({ error: "Unknown demo role" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true, role });
}
