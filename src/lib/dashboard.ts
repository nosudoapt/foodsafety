import type { NavIcon } from "./admin-nav";
import { isRole, type Role } from "./roles";
import type { CountFilter } from "./query-count";
export { verifiedCount } from "./query-count";

export type MetricId = "locations" | "checksToday" | "cleaningToday" | "temperatureAlerts" | "openActions" | "trainingDue" | "renewals" | "documents" | "licensesDue" | "inspectionsMonth" | "activePromotions" | "plannedPromotions" | "upcomingPosts" | "artwork";
export type MetricValues = Partial<Record<MetricId, number | null>>;
export type DashboardScope = "location" | "group";

export interface MetricDefinition {
  label: string;
  detail: string;
  icon: NavIcon;
  href: string;
  attention?: { title: string; description: string; tone: "danger" | "warning"; priority: number };
}

export const METRICS: Record<MetricId, MetricDefinition> = {
  locations: { label: "Connected locations", detail: "Locations you can access", icon: "newrestaurant", href: "#location-pulse" },
  checksToday: { label: "Your checks today", detail: "Completed checklists · today", icon: "checks", href: "/checks" },
  cleaningToday: { label: "Your cleaning today", detail: "Completed tasks · today", icon: "cleaning", href: "/cleaning" },
  temperatureAlerts: { label: "Flagged temperatures", detail: "Outside safe range · last 7 days", icon: "temperature", href: "/temperatures", attention: { title: "Review flagged temperatures", description: "Check the readings and record any corrective action.", tone: "danger", priority: 1 } },
  openActions: { label: "Open actions", detail: "Recorded issues awaiting resolution", icon: "protocols", href: "/corrective-actions", attention: { title: "Follow up on open actions", description: "Review the issue, record the fix and close the loop.", tone: "danger", priority: 2 } },
  trainingDue: { label: "Your training renewals", detail: "Due in 30 days or overdue", icon: "training", href: "/training", attention: { title: "Check your training renewals", description: "Training records expiring within 30 days, including overdue items.", tone: "warning", priority: 5 } },
  renewals: { label: "Compliance renewals", detail: "Due in 30 days or overdue", icon: "shield", href: "/admin/compliance", attention: { title: "Get ahead of document renewals", description: "Permits and records expiring within 30 days, including overdue items.", tone: "warning", priority: 3 } },
  documents: { label: "Business documents", detail: "Files in your document register", icon: "documents", href: "/admin/documents" },
  licensesDue: { label: "Staff licence renewals", detail: "Due in 30 days or overdue", icon: "licenses", href: "/admin/staff-licenses", attention: { title: "Review staff certifications", description: "Arrange renewals for certificates due within 30 days or overdue.", tone: "warning", priority: 4 } },
  inspectionsMonth: { label: "Inspections this month", detail: "Recorded inspections · calendar month", icon: "inspection", href: "/admin/inspections" },
  activePromotions: { label: "Active promotions", detail: "Marked active in the marketing board", icon: "marketing", href: "/admin/marketing" },
  plannedPromotions: { label: "Planned promotions", detail: "Campaigns still in planning", icon: "branding", href: "/admin/marketing", attention: { title: "Move planned campaigns forward", description: "Review artwork and prepare the next promotion for launch.", tone: "warning", priority: 1 } },
  upcomingPosts: { label: "Scheduled posts", detail: "Dated posts · next 30 days", icon: "calendar", href: "/admin/marketing" },
  artwork: { label: "Promotions with artwork", detail: "Promotion records with an attached file", icon: "documents", href: "/admin/marketing" },
};

export interface DashboardRoleView {
  title: string;
  subtitle: string;
  metrics: readonly MetricId[];
  attention: readonly MetricId[];
  focusTitle: string;
  focusBody: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  responsibility: string;
}

export const DASHBOARD_VIEWS: Record<Role, DashboardRoleView> = {
  staff: {
    title: "A good shift starts here.", subtitle: "Your checks, your records, and the things worth a second look.",
    metrics: ["checksToday", "temperatureAlerts", "cleaningToday", "trainingDue"], attention: ["temperatureAlerts", "openActions", "trainingDue"],
    focusTitle: "Small checks. A safer shift.", focusBody: "Work through your opening checks, log temperatures as you go, and leave a clear handover for the next person.",
    primary: { label: "Open daily checks", href: "/checks" }, secondary: { label: "Log a temperature", href: "/temperatures" },
    responsibility: "Your shift records, cleaning, training and team reference. Operational counters show your own records.",
  },
  manager: {
    title: "Your day, under control.", subtitle: "A clear view of the shift, the exceptions, and what needs your attention.",
    metrics: ["checksToday", "temperatureAlerts", "openActions", "renewals"], attention: ["temperatureAlerts", "openActions", "renewals", "licensesDue"],
    focusTitle: "Keep the next shift one step ahead.", focusBody: "Review unresolved issues, check upcoming renewals, and give the team a clear plan for the day.",
    primary: { label: "Review open actions", href: "/corrective-actions" }, secondary: { label: "Open daily checks", href: "/checks" },
    responsibility: "Daily operations, team certifications, inspections and site documents. Personal check counters are labelled separately.",
  },
  owner: {
    title: "Your business, at a glance.", subtitle: "The details that keep your business moving, brought into one clear view.",
    metrics: ["renewals", "openActions", "documents", "licensesDue"], attention: ["temperatureAlerts", "openActions", "renewals", "licensesDue"],
    focusTitle: "Stay ahead of the next renewal.", focusBody: "Keep the paperwork, people and daily follow-ups in view. Start with the items that need a decision.",
    primary: { label: "Review compliance", href: "/admin/compliance" }, secondary: { label: "View reports", href: "/reports" },
    responsibility: "Site operations, business records, staff renewals, the login vault and new-site setup for your business.",
  },
  multi_location_owner: {
    title: "Every location. One clear view.", subtitle: "See where your sites need support, then open a location to look closer.",
    metrics: ["locations", "temperatureAlerts", "renewals", "openActions"], attention: ["temperatureAlerts", "openActions", "renewals", "licensesDue"],
    focusTitle: "Put your attention where it matters.", focusBody: "Compare recorded exceptions across your locations. Open a site to follow up with the right team.",
    primary: { label: "Compare locations", href: "#location-pulse" }, secondary: { label: "View reports", href: "/reports" },
    responsibility: "Owner-level business records across your locations, with location comparison and drill-down. Daily-operation permissions follow your role.",
  },
  corporate: {
    title: "A clearer picture of the group.", subtitle: "Renewals, inspection records and site-level exceptions, together in one briefing.",
    metrics: ["locations", "renewals", "inspectionsMonth", "licensesDue"], attention: ["temperatureAlerts", "openActions", "renewals", "licensesDue"],
    focusTitle: "Turn oversight into a useful next step.", focusBody: "Spot the sites that need support and use corporate inspections to make standards consistent across the group.",
    primary: { label: "Corporate inspections", href: "/admin/inspections/corporate" }, secondary: { label: "Compare locations", href: "#location-pulse" },
    responsibility: "Group oversight, recorded site exceptions, corporate inspections and marketing. Daily operational records are a review responsibility.",
  },
  designer: {
    title: "Good work, ready to go live.", subtitle: "Your promotions, artwork and publishing calendar, in one focused studio.",
    metrics: ["activePromotions", "plannedPromotions", "upcomingPosts", "artwork"], attention: ["plannedPromotions"],
    focusTitle: "Make the next campaign feel unmistakable.", focusBody: "Bring artwork, formats and the publishing calendar together. Open the marketing board to prepare your next release.",
    primary: { label: "Open marketing board", href: "/admin/marketing" }, secondary: { label: "Find your tools", href: "#workspace-tools" },
    responsibility: "The marketing studio: promotions, attached artwork and dated social posts. This view requests marketing data only.",
  },
};

export function isGroupRole(role: string | null): boolean {
  return role === "multi_location_owner" || role === "corporate";
}

export function metricsForRole(role: string | null): MetricId[] {
  if (!isRole(role)) return [];
  const view = DASHBOARD_VIEWS[role];
  return [...new Set([...view.metrics, ...view.attention])];
}

export function attentionFor(role: Role, values: MetricValues) {
  return DASHBOARD_VIEWS[role].attention.flatMap((id) => {
    const definition = METRICS[id];
    const count = values[id];
    return definition.attention && typeof count === "number" && count > 0
      ? [{ id, count, href: definition.href, icon: definition.icon, ...definition.attention }]
      : [];
  }).sort((a, b) => a.priority - b.priority);
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dashboardDates(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  return { today: dayKey(start), start: start.toISOString(), end: end.toISOString(), week: week.toISOString(), soon: dayKey(soon), month: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)) };
}

export interface DashboardQuery { id: MetricId; table: string; filters: CountFilter[] }
export interface DashboardContext {
  role: Role;
  userId: string;
  locationIds: string[];
  restaurantName: string;
}

export type RecordScope = "personal" | "site" | "restaurant";

export function metricScope(id: MetricId): RecordScope {
  if (["checksToday", "cleaningToday", "trainingDue"].includes(id)) return "personal";
  if (["temperatureAlerts", "openActions", "renewals", "locations"].includes(id)) return "site";
  return "restaurant";
}

/** Location display names are not restaurant identifiers. Registers without a
 * location_id use the profile's restaurant; site records require a known site. */
export function dashboardRecordScope(scope: RecordScope, context: DashboardContext):
  | { column: string; op: "eq"; value: string }
  | { column: string; op: "in"; value: string[] }
  | null {
  if (scope === "personal" || context.role === "staff") {
    return context.userId ? { column: "user_id", op: "eq", value: context.userId } : null;
  }
  if (scope === "site") {
    return context.locationIds.length ? { column: "location_id", op: "in", value: context.locationIds } : null;
  }
  const restaurant = context.restaurantName.trim();
  return restaurant ? { column: "restaurant_name", op: "eq", value: restaurant } : null;
}

// This list also documents which existing schema backs each visible number.
// No broad `select(*)`, privileged browser client, or invented score.
export function metricQuery(id: MetricId, context: DashboardContext, now: Date): DashboardQuery | null {
  if (!metricsForRole(context.role).includes(id) || id === "locations") return null;
  const dates = dashboardDates(now);
  let table = "";
  const filters: CountFilter[] = [];
  const add = (column: string, op: "eq" | "gte" | "lt" | "lte", value: string | boolean) => filters.push({ column, op, value });
  switch (id) {
    case "checksToday": table = "daily_checks"; add("completed", "eq", true); add("created_at", "gte", dates.start); add("created_at", "lt", dates.end); break;
    case "cleaningToday": table = "cleaning_records"; add("completed", "eq", true); add("completed_at", "gte", dates.start); add("completed_at", "lt", dates.end); break;
    case "temperatureAlerts": table = "temperature_records"; add("is_safe", "eq", false); add("recorded_at", "gte", dates.week); add("recorded_at", "lt", dates.end); break;
    case "openActions": table = "corrective_actions"; add("resolved", "eq", false); break;
    case "trainingDue": table = "training_records"; add("expiry_date", "lte", dates.soon); break;
    case "renewals": table = "compliance_documents"; add("expiry_date", "lte", dates.soon); break;
    case "documents": table = "business_documents"; break;
    case "licensesDue": table = "staff_licenses"; add("expiry_date", "lte", dates.soon); break;
    case "inspectionsMonth": table = context.role === "corporate" ? "corporate_inspections" : "inhouse_inspections"; add("inspection_date", "gte", dates.month); add("inspection_date", "lte", dates.today); break;
    case "activePromotions": table = "marketing_promotions"; add("status", "eq", "active"); break;
    case "plannedPromotions": table = "marketing_promotions"; add("status", "eq", "planned"); break;
    case "upcomingPosts": table = "social_media_calendar"; add("post_date", "gte", dates.today); add("post_date", "lte", dates.soon); break;
    case "artwork": table = "marketing_promotions"; filters.push({ column: "file_url", op: "notNull" }); break;
  }
  const scope = dashboardRecordScope(metricScope(id), context);
  if (!scope) return null;
  filters.push(scope);
  return { id, table, filters };
}
