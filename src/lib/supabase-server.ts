// Server-only Supabase client for the BTB inventory API routes.
//
// WHY: every inventory table carries a permissive public RLS policy
// (USING(true) WITH CHECK(true)) plus broad anon grants, so the shared
// browser anon client (src/lib/supabase.ts) is a genuine exposure. This
// module gives the server routes a privileged client so the anon grants can
// be revoked (deploy/04-security-hardening.sql) WITHOUT breaking the app.
//
// KEY RESOLUTION (never logs or returns key values):
//   * SUPABASE_SERVICE_ROLE_KEY — REQUIRED. Server-only env var; NEVER a
//     NEXT_PUBLIC_* name, so it is never inlined into the browser bundle.
//   * SUPABASE_URL is preferred for the server; NEXT_PUBLIC_SUPABASE_URL is a
//     safe URL-only fallback (the URL is not a credential).
//
// SAFETY:
//   * `server-only` makes a client import a build-time error; the runtime guard
//     is defense in depth.
//   * Throws (with a clear message, no secrets) when no URL/key is configured.
//     There is deliberately NO anon-key fallback: once public table access is
//     revoked, an anon fallback would turn a configuration mistake into an
//     outage and would tempt operators to reopen the database.
//   * Session persistence/refresh disabled: this client authenticates by key,
//     never by a user session.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: { url: string; client: SupabaseClient } | null = null;

/** True when a server-only service-role key is configured. */
export function hasServiceRoleKey(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

/**
 * The privileged DB client for authorized server routes.
 */
export function inventoryDb(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("inventoryDb() is server-only — browsers must never hold this client.");
  }

  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error(
      "Privileged Supabase access is not configured: set SUPABASE_SERVICE_ROLE_KEY and " +
        "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in the server environment.",
    );
  }

  if (cached?.url === url) return cached.client;

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = { url, client };
  return client;
}
