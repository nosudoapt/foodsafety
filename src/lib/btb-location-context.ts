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
  const allowed = access.locations.filter((site) => access.locationIds.includes(site.id));
  const pick = (id: string) => {
    const site = allowed.find((item) => item.id === id);
    if (!site) throw new BtbApiError("This branch is not in your workspace.", 403);
    return { id: site.id, name: site.name, slug: site.slug };
  };

  // The shared workspace and the privileged aggregate roles keep the legacy
  // tenant (every branch, or the unowned demo rows) instead of being pinned.
  const aggregate = !identity.employeeId || ["corporate", "owner"].includes(identity.role);
  if (aggregate) {
    if (explicit) {
      if (!isUuid(explicit)) throw new BtbApiError("Choose a valid branch.");
      const site = access.locations.find((item) => item.id === explicit);
      return site ? { id: site.id, name: site.name, slug: site.slug } : null;
    }
    const wanted = slug?.trim().toLowerCase();
    const site = wanted ? access.locations.find((item) => (item.slug ?? "").toLowerCase() === wanted) : undefined;
    return site ? { id: site.id, name: site.name, slug: site.slug } : null;
  }

  if (explicit != null && explicit !== "") {
    if (!isUuid(explicit)) throw new BtbApiError("Choose a valid branch.");
    return pick(explicit);
  }

  const wantedSlug = slug?.trim().toLowerCase();
  if (wantedSlug) {
    const bySlug = allowed.find((site) => (site.slug ?? "").toLowerCase() === wantedSlug);
    // A slug that names no assignment falls through: the proxy also serves the
    // shared demo, whose slug is not a location row.
    if (bySlug) return { id: bySlug.id, name: bySlug.name, slug: bySlug.slug };
  }

  if (allowed.length === 1) return { id: allowed[0].id, name: allowed[0].name, slug: allowed[0].slug };

  // An individual employee with zero or several assignments is refused instead
  // of being shown every location's records.
  if (!allowed.length) throw new BtbApiError("No branch is assigned to your account. Ask your manager to assign one.", 403);
  throw new BtbApiError("Choose one of your assigned branches before using this page.", 400);
}

/** Strict tenant filter: a location sees its rows, the demo sees the unowned rows. */
export function withLocation<Q>(query: Q, location: BtbLocationContext | null): Q {
  const filter = query as { eq: (column: string, value: string) => Q; is: (column: string, value: null) => Q };
  return location ? filter.eq("location_id", location.id) : filter.is("location_id", null);
}

/** The value a new row must carry so it belongs to this tenant and no other. */
export function locationColumn(location: BtbLocationContext | null): string | null {
  return location?.id ?? null;
}
