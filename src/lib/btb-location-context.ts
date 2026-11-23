import { BtbApiError } from "./api-errors";
import type { BtbEffectiveAccess } from "./btb-page-access";
import { isUuid, type BtbIdentity } from "./btb-team";

/**
 * The tenant a BTB request operates on.
 *
 * `null` is the legacy/demo tenant: the rows stamped with no location, which is
 * what the shared workspace and the owner's aggregate view have always used.
 * A real employee is never given `null` — they are pinned to a location they
 * are actually assigned to, and fail closed when they have none.
 */
export interface BtbLocationContext {
  id: string;
  name: string;
  slug: string;
}



/**
 * Resolves the location for this request.
 *
 * Priority: an explicit `?location=` (already used by the platform APIs), then
 * the workspace slug the proxy pins for the current visit, then the single
 * location the employee is assigned to. Anything ambiguous is refused rather
 * than guessed — guessing is how one branch reads another's records.
 */
export function resolveBtbLocation(
  identity: BtbIdentity,
  access: BtbEffectiveAccess,
  explicit?: string | null,
  slug?: string | null,
): BtbLocationContext | null {
  const allowed = access.locations.filter((site) => site.active && access.locationIds.includes(site.id));
  const pick = (id: string) => {
    const site = allowed.find((item) => item.id === id);
    if (!site) throw new BtbApiError("This branch is not in your workspace.", 403);
    return { id: site.id, name: site.name, slug: site.slug };
  };

  if (!identity.employeeId || !isUuid(identity.currentLocationId) || !identity.tenantId) {
    throw new BtbApiError("No active workspace assigned — contact your manager", 403);
  }
  const site = pick(identity.currentLocationId);
  // These are assertions only. Selection happens through /api/auth/location,
  // which rechecks assignments and rotates the signed, revocable session.
  if ((explicit !== undefined && explicit !== null && explicit !== site.id) || (slug && slug !== site.slug)) {
    throw new BtbApiError("This branch is not the current workspace.", 403);
  }
  return site;
}

/** Strict tenant filter: a location sees its rows, the demo sees the unowned rows. */
export function withLocation<Q>(query: Q, location: BtbLocationContext | null): Q {
  if (!location) throw new BtbApiError("No active workspace assigned — contact your manager", 403);
  const filter = query as { eq: (column: string, value: string) => Q };
  return filter.eq("location_id", location.id);
}

/** The value a new row must carry so it belongs to this tenant and no other. */
export function locationColumn(location: BtbLocationContext | null): string | null {
  if (!location) throw new BtbApiError("No active workspace assigned — contact your manager", 403);
  return location.id;
}
