import type { BtbRole } from "./btb-roles";
import { BTB_CARDS, type BtbCard } from "./btb-hub";
import { accessibleBtbCards, btbPageAllowed, BTB_MANAGED_ROLES, pageSlug, type BtbPageAccess } from "./btb-page-access";
import { btbCanView } from "./btb-access";
import type { CountFilter } from "./query-count";

export type BtbMetricId = "checksToday" | "checksPending" | "prepToday" | "cleaningToday" | "ordersToday" | "renewals" | "licensesDue" | "inventoryStatus" | "inspectionsMonth" | "campaigns" | "tools" | "roles" | "pages" | "restrictions";
export type BtbMetricValues = Partial<Record<BtbMetricId, number | string | null>>;
export interface BtbOverview { values: BtbMetricValues; updatedAt: string; day: string; inventoryMonth: string }

export const BTB_METRICS: Record<BtbMetricId, { label: string; detail: string; page?: string; attention?: string }> = {
  checksToday: { label: "Completed checklists", detail: "Saved opening / closing sheets · today", page: "checklists" },
  checksPending: { label: "Unfinished checklists", detail: "Saved sheets still in progress · today", page: "checklists", attention: "Finish the checklists in progress" },
  prepToday: { label: "Prep lines recorded", detail: "Saved prep counts · today", page: "prep-list" },
  cleaningToday: { label: "Cleaning logs", detail: "Tasks recorded · today", page: "cleaning-schedule" },
  ordersToday: { label: "Orders saved today", detail: "Dated order sheets · today", page: "order-sheet" },
  renewals: { label: "Compliance renewals", detail: "Due in 30 days or overdue", page: "compliance", attention: "Review upcoming and overdue renewals" },
  licensesDue: { label: "Staff licence renewals", detail: "Due in 30 days or overdue", page: "staff-licenses", attention: "Arrange staff certificate renewals" },
  inventoryStatus: { label: "Last month’s inventory", detail: "Saved month-end accounting status", page: "month-end-inventory" },
  inspectionsMonth: { label: "Franchise inspections", detail: "Recorded this calendar month", page: "franchise-inspection" },
  campaigns: { label: "Active promotions", detail: "Marked active on the marketing board", page: "marketing" },
  tools: { label: "Your available tools", detail: "Pages enabled for your role" },
  roles: { label: "Managed roles", detail: "Staff through corporate" },
  pages: { label: "Workspace pages", detail: "Pages with role-based access" },
  restrictions: { label: "Page restrictions", detail: "Saved restrictions on eligible pages" },
};

interface BtbView {
  title: string; subtitle: string; focusTitle: string; focusBody: string;
  metrics: BtbMetricId[]; attention: BtbMetricId[]; quick: string[]; responsibility: string;
}

export const BTB_DASHBOARD_VIEWS: Record<BtbRole, BtbView> = {
  designer: {
    title: "Good work starts with a clear brief.", subtitle: "Approved requests, artwork versions and the content calendar.",
    focusTitle: "Your design workspace", focusBody: "Open the location platform to review approved briefs and deliver artwork.",
    metrics: [], attention: [], quick: ["platform"], responsibility: "Design approved marketing work and maintain the content calendar.",
  },
  owner: {
    title: "One connected restaurant group.", subtitle: "Locations, people and operations in one workspace.",
    focusTitle: "Your location platform", focusBody: "Manage location access, reporting and configuration from the platform.",
    metrics: [], attention: [], quick: ["platform"], responsibility: "Configure the organization and oversee each location.",
  },
  staff: {
    title: "Ready for a good shift.", subtitle: "Your shift essentials, saved progress and kitchen reference, together.",
    focusTitle: "Set the next person up for success.", focusBody: "Start with opening checks, keep prep counts current, and finish with a clear close. Your saved records keep the handover moving.",
    metrics: ["checksToday", "prepToday", "cleaningToday", "tools"], attention: ["checksPending"], quick: ["checklists", "prep-list", "cleaning-schedule"],
    responsibility: "Complete shift checks, prep and cleaning. Read the roster, training, recipes and safety reference.",
  },
  supervisor: {
    title: "A smoother shift starts here.", subtitle: "Coordinate the floor, review the order sheet and keep the handover clear.",
    focusTitle: "Give the team a clear next step.", focusBody: "Check outstanding duties, review today’s order lines, and flag renewals to your manager before they become urgent.",
    metrics: ["checksToday", "ordersToday", "renewals", "licensesDue"], attention: ["checksPending", "renewals", "licensesDue"], quick: ["checklists", "order-sheet", "compliance"],
    responsibility: "Manage schedules, staff records and order sheets. Track employee training; managers approve completed modules.",
  },
  manager: {
    title: "Your restaurant, in focus.", subtitle: "Shift progress, renewals and the month-end close — with a next step for each.",
    focusTitle: "From the first check to the final count.", focusBody: "Keep the team’s records current, plan certificate renewals, and review the inventory close before moving into the next month.",
    metrics: ["renewals", "licensesDue", "inventoryStatus", "checksToday"], attention: ["renewals", "licensesDue", "checksPending"], quick: ["month-end-inventory", "cash-out", "staff-schedule"],
    responsibility: "Run the restaurant: stock, cash-out, rosters, training, compliance and team records. Manage operational updates.",
  },
  corporate: {
    title: "The bigger picture, made clear.", subtitle: "Review standards, renewals and campaigns across the BTB workspace.",
    focusTitle: "Make consistency part of every visit.", focusBody: "Use franchise inspections to record standards, review the renewal register, and align the next marketing release.",
    metrics: ["renewals", "licensesDue", "inspectionsMonth", "campaigns"], attention: ["renewals", "licensesDue"], quick: ["franchise-inspection", "marketing", "new-restaurant"],
    responsibility: "Review operations and lead franchise inspections, marketing and new-restaurant setup. Operational sheets are read-only.",
  },
  admin: {
    title: "The right tools. The right people.", subtitle: "A clear picture of role access across the Between the Buns workspace.",
    focusTitle: "Make each workspace fit the job.", focusBody: "Review the four operational roles and adjust page availability. Role-level editing rights remain visible alongside each setting.",
    metrics: ["roles", "pages", "restrictions", "tools"], attention: [], quick: ["admin"],
    responsibility: "Configure page availability for staff, supervisors, managers and corporate from the access editor.",
  },
};

export function btbMetricIds(role: BtbRole, rows: readonly BtbPageAccess[]): BtbMetricId[] {
  const view = BTB_DASHBOARD_VIEWS[role];
  return [...new Set([...view.metrics, ...view.attention])].filter((id) => {
    const page = BTB_METRICS[id].page;
    if (!page) return true;
    const card = BTB_CARDS.find((item) => pageSlug(item) === page);
    return !!card && btbPageAllowed(card, role, rows);
  });
}

export function btbDateWindow(day: string) {
  const now = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(now.getTime()) || now.toISOString().slice(0, 10) !== day) return null;
  const soon = new Date(now);
  soon.setUTCDate(soon.getUTCDate() + 30);
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { today: day, soon: soon.toISOString().slice(0, 10), monthStart: `${day.slice(0, 7)}-01`, inventoryMonth: previous.toISOString().slice(0, 7) };
}

export function btbCountQuery(id: BtbMetricId, day: string): { table: string; filters: CountFilter[] } | null {
  const dates = btbDateWindow(day);
  if (!dates) return null;
  // These existing registers explicitly belong to BTB. Location-less tables
  // from other workspaces are not included in this restaurant overview.
  const filters: CountFilter[] = [{ column: "restaurant_name", op: "eq", value: "Between the Buns" }];
  const onDay = (column: string) => filters.push({ column, op: "eq", value: day });
  let table: string;
  switch (id) {
    case "checksToday": case "checksPending": table = "btb_shift_checks"; onDay("check_date"); filters.push({ column: "completed", op: "eq", value: id === "checksToday" }); break;
    case "prepToday": table = "prep_counts"; onDay("count_date"); break;
    case "cleaningToday": table = "cleaning_logs"; onDay("done_date"); break;
    case "ordersToday": table = "btb_order_sheets"; onDay("order_date"); break;
    case "renewals": table = "compliance_documents"; filters.push({ column: "expiry_date", op: "lte", value: dates.soon }); break;
    case "licensesDue": table = "btb_staff_licences"; filters.push({ column: "expiry_date", op: "lte", value: dates.soon }); break;
    case "inspectionsMonth": table = "corporate_inspections"; filters.push({ column: "inspection_date", op: "gte", value: dates.monthStart }, { column: "inspection_date", op: "lte", value: day }); break;
    case "campaigns": table = "marketing_promotions"; filters.push({ column: "status", op: "eq", value: "active" }); break;
    default: return null;
  }
  return { table, filters };
}

export function btbAccessSummary(role: BtbRole, rows: readonly BtbPageAccess[]): BtbMetricValues {
  return {
    tools: accessibleBtbCards(role, rows).length,
    ...(role === "admin" ? {
      roles: BTB_MANAGED_ROLES.length,
      pages: BTB_CARDS.filter((card) => card.feature !== "admin_dashboard").length,
      restrictions: BTB_MANAGED_ROLES.reduce((total, item) => total + BTB_CARDS.filter((card) => btbCanView(card.feature, item) && !btbPageAllowed(card, item, rows)).length, 0),
    } : {}),
  };
}

export function btbCardGroup(card: BtbCard): string {
  if (["prep_list", "checklists", "order_sheet", "cleaning_schedule", "temperatures", "month_end_inventory", "cash_out"].includes(card.feature)) return "Shift & stock";
  if (["reference", "emergency", "protocols", "handbook", "manuals", "training_guide", "staff_schedule", "employees", "loyalty_rewards"].includes(card.feature)) return "People & reference";
  return "Business & standards";
}

export function searchBtbCards(role: BtbRole, rows: readonly BtbPageAccess[] | null, query: string): BtbCard[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return accessibleBtbCards(role, rows).filter((card) => card.hub !== false && terms.every((term) => `${card.title} ${card.desc} ${btbCardGroup(card)}`.toLowerCase().includes(term)));
}
