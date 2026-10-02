// Location model (Patch W3) — one module, two layers.
//
//  1. THE RULES (pure): which sites a profile may see, and which one is
//     active. AuthContext owns the Supabase round-trips around them;
//     tests/locations.test.ts pins them down — keep this layer import-free.
//  2. THE ACTIVE-SITE HANDLE: localStorage-backed, read by the operational
//     pages (prep / order / cleaning) so their queries scope themselves to the
//     site picked in the dashboard header.
//
// Both layers share ACTIVE_LOCATION_KEY, so a switch written by the header is
// picked up by the next page mount without a reload or a re-login.

export interface SiteLocation {
  id: string;
  name: string;
  address?: string | null;
}

/** Roles that own the whole group and may switch between every site. */
export const MULTI_SITE_ROLES = ["multi_location_owner", "corporate"] as const;

/** Roles the dashboard header shows the location switcher to. */
export const LOCATION_SWITCHER_ROLES = ["owner", "multi_location_owner"] as const;

/** localStorage key that keeps the active site across reloads. */
export const ACTIVE_LOCATION_KEY = "foodsafety.active_location_id";

export function canSwitchLocation(role: string | null): boolean {
  return !!role && (LOCATION_SWITCHER_ROLES as readonly string[]).includes(role);
}

/**
 * The sites a profile is allowed to work against, in display order.
 *
 * - multi-location owners / corporate see every site
 * - everyone else sees their memberships plus their home site
 * - an unassigned profile falls back to the default (first) site instead of
 *   seeing the whole group — see the backfill in supabase/schema-locations.sql
 * - no sites at all (SQL not applied, or signed out) → nothing to scope by
 */
export function visibleLocations(
  role: string | null,
  sites: SiteLocation[],
  memberIds: Iterable<string>,
  homeId: string | null,
): SiteLocation[] {
  if (sites.length === 0) return [];
  if ((MULTI_SITE_ROLES as readonly string[]).includes(role ?? "")) return sites;

  const allowed = new Set<string>(memberIds);
  if (homeId) allowed.add(homeId);
  const mine = sites.filter((s) => allowed.has(s.id));
  return mine.length > 0 ? mine : sites.slice(0, 1);
}

/**
 * The active site id: the remembered choice if it is still one of ours,
 * otherwise the home site, otherwise the first visible site.
 */
export function resolveActiveLocation(
  visible: SiteLocation[],
  rememberedId: string | null,
  homeId: string | null,
): string | null {
  if (visible.length === 0) return null;
  for (const id of [rememberedId, homeId]) {
    if (id && visible.some((v) => v.id === id)) return id;
  }
  return visible[0].id;
}

/**
 * `.or()` filter for a site-scoped query: the active site's rows plus legacy
 * rows written before locations existed (location_id NULL — see the header in
 * supabase/schema-locations.sql). No argument = resolve the site from
 * localStorage (what the operational pages do); an explicit null = leave the
 * query unscoped: SQL not applied, or a session with no resolved site (the
 * BTB tablet).
 */
export function locationScope(locationId?: string | null, column = "location_id"): string | null {
  const id = locationId === undefined ? activeLocationId() : locationId;
  if (!id) return null;
  return `${column}.is.null,${column}.eq.${id}`;
}

// --- active-site handle -------------------------------------------------
// SSR-safe: the dashboard writes it after mount, so every read guards on
// `typeof window` rather than assuming a browser.

export function activeLocationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_LOCATION_KEY);
  } catch {
    return null;
  }
}

export function setActiveLocationId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_LOCATION_KEY, id);
  } catch {
    // Private browsing / storage disabled — the choice just won't survive a reload.
  }
}
