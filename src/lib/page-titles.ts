/** Friendly page names for activity chips, derived from the path. Page titles
 * are unreliable (BTB pages share one generic tagline), so the path is the
 * single source of truth for "recently used / most used" labels. */

const NICE: Record<string, string> = {
  "cleaning-schedule": "Cleaning schedule",
  "compliance": "Compliance",
  "tax-dates": "Tax & filing dates",
  "staff-licenses": "Staff certificates",
  "licence-reminders": "Email reminders",
  "documents": "Business documents",
  "staff-schedule": "Staff schedule",
  "employees": "Employees",
  "temperature": "Temperature sheet",
  "temperatures": "Temperature sheet",
  "inventory": "Inventory",
  "branding-requests": "Branding requests",
  "loyalty": "Loyalty",
  "prep-manual": "Prep manual",
  "allergen-chart": "Allergen chart",
  "fryer-timing": "Fryer timing",
  "gluten-free": "Gluten-free",
  "emergency-contacts": "Emergency contacts",
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

/** "between-the-buns/cleaning-schedule" → "Between the Buns · Cleaning schedule".
 * Anything unrecognised still gets a readable label from the segments. */
export function friendlyPathTitle(path: string): string {
  const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const product = segments[0] === "between-the-buns" ? "Between the Buns" : segments[0] === "admin" ? "FoodSafe admin" : "";
  const rest = product ? segments.slice(1) : segments;
  const parts = rest
    .filter((segment) => segment !== "page" && !/^[0-9a-f-]{36}$/i.test(segment))
    .map((segment) => NICE[segment] ?? segment.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  if (!parts.length) return product || "Home";
  return product ? `${product} · ${parts.join(" · ")}` : parts.join(" · ");
}
