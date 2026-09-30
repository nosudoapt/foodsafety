import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OWNER_TIER_ROLES } from "@/lib/roles";
import { BTB_COOKIE, roleFromSession, btbAccountFor } from "@/lib/btb-auth";
import { btbCanView } from "@/lib/btb-access";
import { isBtbRole } from "@/lib/btb-roles";

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

export async function requireVaultSession(): Promise<VaultAuthResult> {
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
    // Between the Buns path: BTB is cookie-authed (no Supabase session). A valid
    // BTB cookie whose role may view the vault (management tier + corporate, per
    // btb-access) is authorized; DB access uses the anon client (login_vault RLS
    // is public on the BTB demo — see supabase/schema-btb-public.sql). Any other
    // BTB role is refused.
    const btbRole = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
    if (btbRole && isBtbRole(btbRole) && btbCanView("vault", btbRole)) {
      return {
        ok: true,
        session: {
          supabase,
          userId: `btb-${btbRole}`,
          role: btbRole,
          restaurantName: btbAccountFor(btbRole)?.restaurant || "Between the Buns",
        },
      };
    }
    return { ok: false, status: 401, message: "Not signed in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, restaurant_name")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "";
  if (!OWNER.includes(role)) {
    return { ok: false, status: 403, message: "Owner-tier access required." };
  }

  return {
    ok: true,
    session: {
      supabase,
      userId: user.id,
      role,
      restaurantName: profile?.restaurant_name || "Between the Buns",
    },
  };
}
