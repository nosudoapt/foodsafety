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
  const user = await getSessionUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("restaurant_name, email")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  return {
    userId: user.id,
    restaurantName: data.restaurant_name || DEFAULT_RESTAURANT,
    email: data.email ?? user.email ?? null,
  };
}
