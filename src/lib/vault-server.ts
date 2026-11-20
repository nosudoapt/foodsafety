import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { OWNER_TIER_ROLES } from "@/lib/roles";
import { apiFailure, BtbApiError, dbError, PRIVATE_HEADERS, requireBtbAccess, requireBtbOrigin } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-roles";

const OWNER = OWNER_TIER_ROLES as string[];

export type VaultSession = {
  supabase: SupabaseClient;
  userId: string;
  role: string;
  restaurantName: string;
};

export type VaultAuthResult =
  | { ok: true; session: VaultSession }
  | { ok: false; status: number; message: string };

/** The caller chooses a product, never whichever cookie happens to win.
 * Existing FoodSafe URLs keep their default and never fall back to BTB. */
export async function requireVaultSession(request: Request, edit = false): Promise<VaultAuthResult> {
  const workspace = new URL(request.url).searchParams.get("workspace") ?? "foodsafe";
  if (!["btb", "foodsafe"].includes(workspace)) throw new BtbApiError("Choose a valid workspace.");
  if (workspace === "btb") {
    const { db, identity } = await requireBtbAccess("vault", edit, { allowLocationWorkspace: true });
    return { ok: true, session: { supabase: db, userId: identity.employeeId ?? `btb-${identity.role}`, role: identity.role, restaurantName: BTB_RESTAURANT } };
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: "Not signed in." };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, restaurant_name")
    .eq("id", user.id)
    .single();
  dbError(error, "Your vault access could not be verified. Please retry.");

  const role = profile?.role ?? "";
  if (!OWNER.includes(role)) {
    return { ok: false, status: 403, message: "Owner-tier access required." };
  }
  if (!profile?.restaurant_name?.trim()) return { ok: false, status: 403, message: "A restaurant profile is required." };

  return {
    ok: true,
    session: {
      supabase,
      userId: user.id,
      role,
      restaurantName: profile.restaurant_name,
    },
  };
}

export function vaultRoute(edit: boolean, handler: (session: VaultSession, request: Request) => Promise<unknown>) {
  return async (request: Request) => {
    let tenant = "vault";
    try {
      if (!["GET", "HEAD"].includes(request.method)) requireBtbOrigin(request, "Open the vault in your workspace and try again.");
      const auth = await requireVaultSession(request, edit);
      if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status, headers: PRIVATE_HEADERS });
      tenant = auth.session.restaurantName;
      return NextResponse.json(await handler(auth.session, request), { headers: PRIVATE_HEADERS });
    } catch (error) { return apiFailure(error, request, tenant); }
  };
}
