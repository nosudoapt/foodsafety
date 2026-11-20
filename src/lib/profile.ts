// Profile context for inserts. The admin/document tables carry
// user_id + restaurant_name NOT NULL (and business_documents also
// uploaded_by), so every write needs the signed-in profile first.
import { supabase } from "@/lib/supabase";

export const DEFAULT_RESTAURANT = "Between the Buns";

export interface ProfileContext {
  userId: string;
  restaurantName: string;
  email: string | null;
}

export async function getSessionUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Resolve the insert context for a signed-in user.
 * Returns null when there is no session or no profile row — callers should
 * surface that rather than writing rows that violate NOT NULL.
 */
export async function getProfileContext(): Promise<ProfileContext | null> {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/btb/demo/")) {
    // A simultaneous FoodSafe session is a different identity and tenant.
    const page = window.location.pathname.slice("/btb/demo/".length);
    const response = await fetch(`/api/btb/uploader?page=${encodeURIComponent(page)}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    return await response.json() as ProfileContext;
  }
  const user = await getSessionUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("restaurant_name, email")
    .eq("id", user.id)
    .abortSignal(AbortSignal.timeout(12_000))
    .single();

  if (error || !data) return null;

  return {
    userId: user.id,
    restaurantName: data.restaurant_name || DEFAULT_RESTAURANT,
    email: data.email ?? user.email ?? null,
  };
}
