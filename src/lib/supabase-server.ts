// Server-only Supabase client for the BTB inventory API routes.
//
// WHY: every inventory table carries a permissive public RLS policy
// (USING(true) WITH CHECK(true)) plus broad anon grants, so the shared
// browser anon client (src/lib/supabase.ts) is a genuine exposure. This
// module gives the server routes a privileged client so the anon grants can
// be revoked (deploy/04-security-hardening.sql) WITHOUT breaking the app.
//
// KEY RESOLUTION (never logs or returns key values):
//   * SUPABASE_SERVICE_ROLE_KEY  — preferred. Server-only env var; NEVER a
//     NEXT_PUBLIC_* name, so it is never inlined into the browser bundle.
//   * Falls back to the anon key with a one-time console warning so the
//     prototype keeps working before the service key is configured. The
//     fallback is server-side only — it never re-exposes the key to browsers.
//
// SAFETY:
//   * Throws if somehow invoked in a browser context.
//   * Throws (with a clear message, no secrets) when no URL/key is configured
//     instead of silently connecting somewhere unintended.
//   * Session persistence/refresh disabled: this client authenticates by key,
//     never by a user session.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: { key: string; client: SupabaseClient } | null = null;
let anonFallbackWarned = false;

/** True when a server-only service-role key is configured. */
export function hasServiceRoleKey(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * The DB client for authorized server routes. Service-role when configured,
 * otherwise the anon key (prototype fallback, warned once).
 */
export function inventoryDb(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("inventoryDb() is server-only — browsers must never hold this client.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "(plus SUPABASE_SERVICE_ROLE_KEY for privileged server access) in the server environment.",
    );
  }

  if (!serviceKey && !anonFallbackWarned) {
    anonFallbackWarned = true;
    // No key material in the message — only the implication.
    console.warn(
      "[supabase-server] SUPABASE_SERVICE_ROLE_KEY is not set — server routes are using the anon key. " +
        "Anonymous database access cannot be revoked until the service-role key is configured.",
    );
  }

  const cacheKey = `${url}|${serviceKey ? "service" : "anon"}`;
  if (cached?.key === cacheKey) return cached.client;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = { key: cacheKey, client };
  return client;
}
