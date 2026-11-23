import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError } from "./api-errors";
import { accessibleBtbCards, isBtbPageAccess, pageSlug, type BtbEffectiveAccess } from "./btb-page-access";
import { isUuid, type BtbIdentity } from "./btb-team";

/** Request-time only. Neither restrictions nor location grants are cached across
 * requests, and a failed/missing resolver never becomes legacy access. */
export async function loadBtbEffectiveAccess(db: SupabaseClient, identity: BtbIdentity): Promise<BtbEffectiveAccess> {
  if (!identity.employeeId || !identity.tenantId || !identity.currentLocationId) throw new BtbApiError("No active workspace assigned — contact your manager", 403);
  let query = db.from("role_page_access").select("role,page,allowed");
  if (identity.role !== "admin") query = query.eq("role", identity.role);
  const [restrictions, assigned] = await Promise.all([
    query.abortSignal(AbortSignal.timeout(10_000)),
    db.rpc("workspace_btb_page_grants", { p_employee: identity.employeeId, p_location: identity.currentLocationId }),
  ]);
  if (restrictions.error || assigned.error || !Array.isArray(restrictions.data) || !restrictions.data.every(isBtbPageAccess)) {
    throw new BtbApiError("Page access could not be verified. Please try again.", 503, restrictions.error ?? assigned.error);
  }
  const grants = assigned.data as { locationIds?: unknown; pageGrants?: unknown } | null;
  if (!grants || !Array.isArray(grants.locationIds) || !grants.locationIds.every(isUuid)
    || grants.pageGrants !== null && (!Array.isArray(grants.pageGrants) || !grants.pageGrants.every(page => typeof page === "string"))) {
    throw new BtbApiError("Location page access could not be verified. Please try again.", 503);
  }
  const locationIds = grants.locationIds as string[];
  const pageGrants = grants.pageGrants as string[] | null;
  const locations: BtbEffectiveAccess["locations"] = [];
  if (locationIds.length) {
    const [names, settings] = await Promise.all([
      db.from("locations").select("id,name,slug").in("id", locationIds),
      db.from("btb_location_settings").select("location_id,active").in("location_id", locationIds),
    ]);
    if (names.error || settings.error || names.data?.length !== locationIds.length || settings.data?.length !== locationIds.length) {
      throw new BtbApiError("Assigned locations could not be loaded. Please try again.", 503, names.error ?? settings.error);
    }
    for (const site of names.data) locations.push({ id: site.id, name: site.name, slug: site.slug ?? "", active: settings.data.some(row => row.location_id === site.id && row.active) });
    locations.sort((a, b) => a.name.localeCompare(b.name));
  }
  return {
    rows: restrictions.data, locationIds, pageGrants, locations,
    pages: accessibleBtbCards(identity.role, restrictions.data, pageGrants).filter(card => card.feature !== "platform" || identity.employeeId).map(pageSlug),
    locationWorkspace: !!identity.employeeId && (pageGrants !== null || ["designer", "corporate", "owner"].includes(identity.role)),
  };
}
