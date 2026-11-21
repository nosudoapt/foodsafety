import { btbCardForPath, type BtbEffectiveAccess } from "./btb-page-access";
import { friendlyPathTitle } from "./page-titles";

export type ActivityWorkspace = "foodsafe" | "btb";
export type ActivityRow = { path: string; title?: string; created_at: string };

/** Paths contain no URL, query, fragment or browser-supplied location. */
export function activityPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300 || !value.startsWith("/")
    || value.startsWith("//") || /[\\?#\s\u0000-\u001f]/.test(value)
    || value.split("/").some(segment => [".", ".."].includes(segment))) return null;
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

/** Keep previously recorded visits useful after the permanent BTB URL move. */
export function canonicalBtbActivityPath(value: unknown): string | null {
  const path = activityPath(value);
  if (!path) return null;
  if (path === "/between-the-buns" || path === "/btb") return "/btb/demo";
  if (path.startsWith("/between-the-buns/")) return `/btb/demo/${path.slice("/between-the-buns/".length)}`;
  // Current URLs are /btb/<location-slug>/<page>. Store the stable page path so
  // chips do not mix location slugs; the demo, sign-in and console are already
  // canonical.
  if (path.startsWith("/btb/") && !/^\/btb\/(demo|admin|login|demo-login)(\/|$)/.test(path)) {
    const parts = path.split("/").filter(Boolean);
    // Pre-move URLs were /btb/<page>. Only treat the second segment as a
    // location when it is not a known page; otherwise keep it as the page.
    if (btbCardForPath(`/btb/demo/${parts[1]}`)) return `/btb/demo/${parts.slice(1).join("/")}`;
    const rest = parts.slice(2).join("/");
    return rest ? `/btb/demo/${rest}` : "/btb/demo";
  }
  return path;
}

export function btbActivityPathAllowed(path: string, access: Pick<BtbEffectiveAccess, "pages">): boolean {
  if (["/btb/demo", "/btb/demo/account"].includes(path)) return true;
  const card = btbCardForPath(path);
  if (!card || !access.pages.includes(card.href.slice("/btb/demo/".length))) return false;
  return path === card.href || card.feature === "platform" && ["/btb/demo/platform/overview", "/btb/demo/platform/settings"].includes(path);
}

export function activityLocationId(employeeId: string | null, locationIds: readonly string[]): string | null {
  return employeeId && locationIds.length === 1 ? locationIds[0] : null;
}

export function activityPathInWorkspace(path: string, workspace: ActivityWorkspace): boolean {
  const btb = /^\/(btb|between-the-buns)(\/|$)/.test(path);
  return workspace === "btb" ? path === "/btb/demo" || path.startsWith("/btb/demo/") : !btb;
}

/** First visit = recency; count = usage. Stored browser titles are never used. */
export function activitySummary(rows: readonly ActivityRow[]) {
  const firstSeen = new Map<string, ActivityRow>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
    const prior = firstSeen.get(row.path);
    if (!prior || row.created_at > prior.created_at) firstSeen.set(row.path, row);
  }
  return {
    recent: [...firstSeen.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)
      .map(row => ({ path: row.path, title: friendlyPathTitle(row.path), at: row.created_at })),
    top: [...counts.entries()].map(([path, visits]) => ({ path, title: friendlyPathTitle(path), visits }))
      .sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path)).slice(0, 8),
  };
}
