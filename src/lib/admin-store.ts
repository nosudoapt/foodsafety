"use client";

import { supabase } from "@/lib/supabase";

export const DEFAULT_RESTAURANT = "Between the Buns";

export async function getSessionUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function getProfileContext(): Promise<{
  userId: string | null;
  restaurantName: string;
  email: string | null;
}> {
  const user = await getSessionUser();
  if (!user) {
    return { userId: null, restaurantName: DEFAULT_RESTAURANT, email: null };
  }
  const { data } = await supabase
    .from("profiles")
    .select("restaurant_name, email")
    .eq("id", user.id)
    .single();
  return {
    userId: user.id,
    restaurantName: data?.restaurant_name || DEFAULT_RESTAURANT,
    email: data?.email || user.email || null,
  };
}

/** Read localStorage after mount (SSR-safe). */
export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Load from Supabase when signed in; always fall back to localStorage cache.
 * Returns source so UI can show "cloud" vs "local".
 */
export async function loadAdminData<T>(
  localStorageKey: string,
  fetchRemote: () => Promise<{ data: T | null; error: unknown }>,
  fallback: T
): Promise<{ data: T; source: "supabase" | "local" }> {
  const user = await getSessionUser();
  if (user) {
    try {
      const { data, error } = await fetchRemote();
      if (!error && data != null) {
        writeLocal(localStorageKey, data);
        return { data, source: "supabase" };
      }
    } catch {
      /* fall through to local */
    }
  }
  const local = readLocal<T>(localStorageKey, fallback);
  return { data: local, source: "local" };
}

/** Persist to localStorage always; to Supabase when signed in. */
export async function saveAdminData<T>(
  localStorageKey: string,
  value: T,
  pushRemote?: () => Promise<{ error: unknown }>
): Promise<{ source: "supabase" | "local" }> {
  writeLocal(localStorageKey, value);
  const user = await getSessionUser();
  if (user && pushRemote) {
    try {
      const { error } = await pushRemote();
      if (!error) return { source: "supabase" };
    } catch {
      /* local only */
    }
  }
  return { source: "local" };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
