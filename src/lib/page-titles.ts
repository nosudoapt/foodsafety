/** Friendly page names for activity chips, derived from the path. Page titles
 * are unreliable (BTB pages share one generic tagline), so the path is the
 * single source of truth for "recently used / most used" labels. */

// Short, literal labels for activity chips. These must stay short: they are
// rendered as pills, and a long name truncates to something unrecognisable.
const NICE: Record<string, string> = {
  "prep-list": "Prep sheet",
  "checklists": "Opening & closing",
  "cleaning-schedule": "Cleaning",
  "temperatures": "Temperatures",
  "temperature": "Temperatures",
  "cash-out": "Cash out",
  "order-sheet": "Order sheet",
  "month-end-inventory": "Month-end stock",
  "staff-schedule": "Schedule",
  "employees": "Employees",
  "training-guide": "Training",
  "loyalty-rewards": "Loyalty",
  "loyalty": "Loyalty",
  "branding-requests": "Branding",
  "compliance": "Compliance",
  "tax-dates": "Tax dates",
  "documents": "Documents",
  "staff-licenses": "Staff certificates",
  "licence-reminders": "Email reminders",
  "inspections": "Inspections",
  "franchise-inspection": "Franchise audit",
  "marketing": "Marketing",
  "new-restaurant": "Opening checklist",
  "vault": "Login vault",
  "prep-manual": "Prep manual",
  "menu": "Menu",
  "allergen-chart": "Allergens",
  "gluten-free": "Gluten free",
  "fryer-timing": "Fryer timing",
  "emergency": "Emergency",
  "emergency-contacts": "Emergency",
  "protocols": "Protocols",
  "handbook": "Handbook",
  "manuals": "Manuals",
  "platform": "Location workspace",
  "account": "My account",
  "dashboard": "Dashboard",
  "operations": "Operations",
  "reports": "Reports",
  "overview": "Overview",
  "settings": "Settings",
  "roles": "Roles & access",
  "locations": "Locations",
  "stock": "Stock",
  "admin": "Admin",
};

/** "btb/demo/cleaning-schedule" → "Cleaning". Anything unrecognised still gets
 * a readable label from the segments.
 *
 * BTB labels carry no product prefix on purpose: these chips are only ever
 * shown inside the BTB workspace, where "Between the Buns · …" on every pill
 * is noise that pushes the actual page name into a truncated ellipsis. The
 * workspace is named once, by the page header around the chips.
 * A non-BTB product keeps its prefix, because its chips can sit next to
 * another product's. */
export function friendlyPathTitle(path: string): string {
  const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const btb = segments[0] === "btb";
  const product = btb ? "" : segments[0] === "admin" ? "FoodSafe admin" : "";
  // /btb/demo/<page> nests one level deeper than the old URLs did.
  const rest = btb ? segments.slice(segments[1] === "demo" ? 2 : 1) : product ? segments.slice(1) : segments;
  const parts = rest
    .filter((segment) => segment !== "page" && !/^[0-9a-f-]{36}$/i.test(segment))
    .map((segment) => NICE[segment] ?? segment.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  if (!parts.length) return btb ? "Overview" : product || "Home";
  return product ? `${product} · ${parts.join(" · ")}` : parts.join(" · ");
}
