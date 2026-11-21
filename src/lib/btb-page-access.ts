import { btbCanView } from "./btb-access";
import { BTB_CARDS, type BtbCard } from "./btb-hub";
import { isBtbRole, type BtbRole } from "./btb-roles";

export const BTB_MANAGED_ROLES = ["staff", "supervisor", "manager", "corporate"] as const;
export interface BtbPageAccess { role: BtbRole; page: string; allowed: boolean }
export interface BtbAssignedLocation { id: string; name: string; slug: string; active: boolean }
export interface BtbEffectiveAccess {
  rows: BtbPageAccess[];
  /** Retained assignments, including closed sites; only active sites grant pages. */
  locationIds: string[];
  /** null is legacy/unassigned; an empty list explicitly denies every page. */
  pageGrants: string[] | null;
  locations: BtbAssignedLocation[];
  pages: string[];
  locationWorkspace: boolean;
}

export function pageSlug(card: BtbCard): string {
  return card.href.slice("/btb/demo/".length);
}

export function btbCardForPath(path: string): BtbCard | undefined {
  const pathname = path.split(/[?#]/)[0];
  return [...BTB_CARDS].sort((a, b) => b.href.length - a.href.length)
    .find((card) => pathname === card.href || pathname.startsWith(`${card.href}/`));
}

export function isBtbPageAccess(value: unknown): value is BtbPageAccess {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return isBtbRole(row.role) && typeof row.page === "string" && typeof row.allowed === "boolean";
}

export function isBtbEffectiveAccess(value: unknown): value is BtbEffectiveAccess {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Array.isArray(row.rows) && row.rows.every(isBtbPageAccess)
    && Array.isArray(row.locationIds) && row.locationIds.every(id => typeof id === "string")
    && (row.pageGrants === null || Array.isArray(row.pageGrants) && row.pageGrants.every(page => typeof page === "string"))
    && Array.isArray(row.pages) && row.pages.every(page => typeof page === "string")
    && typeof row.locationWorkspace === "boolean" && Array.isArray(row.locations)
    && row.locations.every(site => site && typeof site.id === "string" && typeof site.name === "string" && typeof site.active === "boolean");
}

/** Saved restrictions narrow the role matrix. An absent row uses the role's
 * default; an unavailable matrix (null) never silently grants access. */
export function btbPageAllowed(card: BtbCard, role: BtbRole, rows: readonly BtbPageAccess[] | null, grants: readonly string[] | null = null): boolean {
  if (!btbCanView(card.feature, role)) return false;
  if (card.feature === "admin_dashboard") return true;
  if (rows === null) return false;
  if (grants !== null && !grants.includes(pageSlug(card))) return false;
  return !rows.some((row) => row.role === role && row.page === pageSlug(card) && !row.allowed);
}

export function accessibleBtbCards(role: BtbRole, rows: readonly BtbPageAccess[] | null, grants: readonly string[] | null = null): BtbCard[] {
  return BTB_CARDS.filter((card) => btbPageAllowed(card, role, rows, grants));
}

export function validateAccessChanges(body: unknown): BtbPageAccess[] | null {
  if (!body || typeof body !== "object") return null;
  const input = "rows" in body ? body.rows : [body];
  if (!Array.isArray(input) || input.length === 0 || input.length > BTB_CARDS.length * BTB_MANAGED_ROLES.length) return null;
  const keys = new Set<string>();
  for (const row of input) {
    if (!isBtbPageAccess(row) || row.role === "admin") return null;
    const card = BTB_CARDS.find((item) => pageSlug(item) === row.page);
    if (!card || card.feature === "admin_dashboard" || (row.allowed && !btbCanView(card.feature, row.role))) return null;
    const key = `${row.role}:${row.page}`;
    if (keys.has(key)) return null;
    keys.add(key);
  }
  return input.map(({ role, page, allowed }) => ({ role, page, allowed }));
}
