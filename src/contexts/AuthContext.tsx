"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  ACTIVE_LOCATION_KEY,
  resolveActiveLocation,
  setActiveLocationId,
  visibleLocations,
  type SiteLocation,
} from "@/lib/locations";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Signed-in profile's RBAC role, null until it resolves (or when signed out). */
  role: string | null;
  displayName: string;
  restaurantName: string;
  /** True while the profile + locations are being fetched. */
  profileLoading: boolean;
  /** The sites this user may work against (empty when unknown). */
  locations: SiteLocation[];
  /** Failed location reads are distinct from a verified empty assignment. */
  locationsError: string;
  reloadProfile: () => void;
  /** Active site id — what every operational query scopes itself to. */
  locationId: string | null;
  setLocationId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  role: null,
  displayName: "",
  restaurantName: "",
  profileLoading: false,
  locations: [],
  locationsError: "",
  reloadProfile: () => {},
  locationId: null,
  setLocationId: () => {},
});

function readRememberedLocation(): string | null {
  try {
    return localStorage.getItem(ACTIVE_LOCATION_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [profile, setProfile] = useState<{
    key: string; role: string | null; displayName: string; restaurantName: string;
    locations: SiteLocation[]; locationId: string | null; locationsError: string;
  } | null>(null);
  const userId = user?.id;
  const email = user?.email;
  const key = `${userId}:${revision}`;
  const reloadProfile = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session) {
        // Callback context (not an effect body) — a sign-out clears the
        // profile before the next sign-in.
        setProfile(null);
        setActiveLocationId(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // A profile can resolve even if location data is unavailable. Never turn a
  // failed membership read into a default-site assignment or a zero count.
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    (async () => {
      try {
        // Two profile reads, not one: a database without profiles.location_id
        // would fail the whole select and take the role down with it.
        const [identity, home, sites, memberships] =
          await Promise.all([
            supabase.from("profiles").select("role, full_name, restaurant_name").eq("id", userId).abortSignal(controller.signal).maybeSingle(),
            supabase.from("profiles").select("location_id").eq("id", userId).abortSignal(controller.signal).maybeSingle(),
            supabase.from("locations").select("id, name, address").order("created_at").abortSignal(controller.signal),
            supabase.from("location_members").select("location_id").eq("user_id", userId).abortSignal(controller.signal),
          ]);
        if (cancelled) return;

        const profileRole = identity.error ? null : identity.data;
        const nextRole = (profileRole?.role as string | undefined) ?? null;
        const homeId = (home.data?.location_id as string | undefined) ?? null;
        const locationsError = home.error || sites.error || memberships.error ? "Your locations couldn’t be loaded. Retry to restore site figures." : "";
        const memberIds = (memberships.data ?? []).map((m: { location_id: string }) => m.location_id);
        const visible = locationsError || !nextRole ? [] : visibleLocations(nextRole, (sites.data ?? []) as SiteLocation[], memberIds, homeId);
        const active = resolveActiveLocation(visible, readRememberedLocation(), homeId);
        setProfile({ key, role: nextRole, displayName: profileRole?.full_name || email?.split("@")[0] || "Your team",
          restaurantName: profileRole?.restaurant_name || "", locations: visible, locationId: active, locationsError });
        setActiveLocationId(active);
      } catch {
        if (!cancelled) {
          setProfile({ key, role: null, displayName: "", restaurantName: "", locations: [], locationId: null, locationsError: "Your locations couldn’t be loaded." });
          setActiveLocationId(null);
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [key, userId, email]);

  const setLocationId = useCallback((id: string) => {
    if (profile?.key !== key || !profile.locations.some((site) => site.id === id)) return;
    setProfile({ ...profile, locationId: id });
    setActiveLocationId(id);
  }, [profile, key]);

  const current = user && profile?.key === key ? profile : null;
  const profileLoading = !!user && !current;

  return (
    <AuthContext.Provider
      value={{ user, loading, role: current?.role ?? null, displayName: current?.displayName ?? "", restaurantName: current?.restaurantName ?? "", profileLoading,
        locations: current?.locations ?? [], locationId: current?.locationId ?? null, locationsError: current?.locationsError ?? "", reloadProfile, setLocationId }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
