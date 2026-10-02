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
  /** True while the profile + locations are being fetched. */
  profileLoading: boolean;
  /** The sites this user may work against (empty when unknown). */
  locations: SiteLocation[];
  /** Active site id — what every operational query scopes itself to. */
  locationId: string | null;
  setLocationId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  role: null,
  profileLoading: false,
  locations: [],
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
  const [role, setRole] = useState<string | null>(null);
  // Which user `role`/`locations`/`locationId` belong to. Loading is derived
  // from it (never set directly), so effect bodies stay setState-free.
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [locations, setLocations] = useState<SiteLocation[]>([]);
  const [locationId, setLocationIdState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session) {
        // Callback context (not an effect body) — a sign-out clears the
        // profile before the next sign-in.
        setRole(null);
        setLocations([]);
        setLocationIdState(null);
        setProfileFor(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Profile + locations: role, home site, memberships, and the active site.
  // Every query degrades to "no location" if a table or column is missing, so
  // the app still works against a database that predates schema-locations.sql.
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      try {
        // Two profile reads, not one: a database without profiles.location_id
        // would fail the whole select and take the role down with it.
        const [{ data: profileRole }, { data: home }, { data: sites }, { data: memberships }] =
          await Promise.all([
            supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
            supabase.from("profiles").select("location_id").eq("id", user.id).maybeSingle(),
            supabase.from("locations").select("id, name, address").order("created_at"),
            supabase.from("location_members").select("location_id").eq("user_id", user.id),
          ]);
        if (cancelled) return;

        const nextRole = (profileRole?.role as string | undefined) ?? null;
        const homeId = (home?.location_id as string | undefined) ?? null;
        const allSites = (sites ?? []) as SiteLocation[];
        const memberIds = (memberships ?? []).map((m: { location_id: string }) => m.location_id);
        const visible = visibleLocations(nextRole, allSites, memberIds, homeId);

        setRole(nextRole);
        setLocations(visible);
        const active = resolveActiveLocation(visible, readRememberedLocation(), homeId);
        setLocationIdState(active);
        // Persist the resolved site, not just an explicit switch: the
        // operational pages read it from localStorage (locationScope /
        // activeLocationId) on mount, and without this the default site would
        // never reach them — the dashboard and the prep sheet would disagree.
        if (active) setActiveLocationId(active);
      } finally {
        if (!cancelled) setProfileFor(user.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setLocationId = useCallback((id: string) => {
    setLocationIdState(id);
    try {
      localStorage.setItem(ACTIVE_LOCATION_KEY, id);
    } catch {
      // Private browsing / storage disabled — the choice just won't survive a reload.
    }
  }, []);

  const profileLoading = !!user && profileFor !== user.id;

  return (
    <AuthContext.Provider
      value={{ user, loading, role, profileLoading, locations, locationId, setLocationId }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
