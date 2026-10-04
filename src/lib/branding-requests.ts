// Branding Requests — statuses, priorities, board ordering and due-date tone.
// Pure helpers shared by the board page and its tests.

export const BRANDING_STATUSES = ["open", "in_review", "in_progress", "done", "declined"] as const;
export type BrandingStatus = (typeof BRANDING_STATUSES)[number];

export const BRANDING_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type BrandingPriority = (typeof BRANDING_PRIORITIES)[number];

export const BRANDING_CATEGORIES = ["signage", "menu", "uniform", "packaging", "digital", "other"] as const;
export type BrandingCategory = (typeof BRANDING_CATEGORIES)[number];

/** Work left to do — the order the board columns run in. */
export const ACTIVE_STATUSES: readonly BrandingStatus[] = ["open", "in_review", "in_progress"];
const CLOSED: readonly BrandingStatus[] = ["done", "declined"];

export interface BrandingRequest {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  priority: string;
  status: string;
  requested_by?: string | null;
  due_date?: string | null;
  location_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function isStatus(v: unknown): v is BrandingStatus {
  return typeof v === "string" && (BRANDING_STATUSES as readonly string[]).includes(v);
}

export function isPriority(v: unknown): v is BrandingPriority {
  return typeof v === "string" && (BRANDING_PRIORITIES as readonly string[]).includes(v);
}

export function isCategory(v: unknown): v is BrandingCategory {
  return typeof v === "string" && (BRANDING_CATEGORIES as readonly string[]).includes(v);
}

const label = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export const statusLabel = (v: string): string => {
  if (v === "in_review") return "In review";
  if (v === "in_progress") return "In progress";
  return label(v);
};

export const priorityLabel = label;
export const categoryLabel = label;

/** Board column / badge colour. */
export function statusAccent(v: string): "red" | "amber" | "purple" | "green" | "slate" {
  if (v === "open") return "red";
  if (v === "in_review") return "amber";
  if (v === "in_progress") return "purple";
  if (v === "done") return "green";
  return "slate";
}

export function priorityAccent(v: string): "red" | "amber" | "blue" | "slate" {
  if (v === "urgent") return "red";
  if (v === "high") return "amber";
  if (v === "normal") return "blue";
  return "slate";
}

/** Urgent → 0 … low → 3: lower sorts first (independent of the dropdown order). */
const RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function priorityRank(v: string): number {
  return v in RANK ? RANK[v] : RANK.normal;
}

/** Board grouping — active columns first, then the two closed ones. */
export function boardColumns(requests: readonly BrandingRequest[]): Record<string, BrandingRequest[]> {
  const out: Record<string, BrandingRequest[]> = {};
  for (const s of [...ACTIVE_STATUSES, ...CLOSED]) out[s] = [];
  for (const r of requests) {
    const key = isStatus(r.status) ? r.status : "open";
    out[key].push(r);
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => {
      const p = priorityRank(a.priority) - priorityRank(b.priority);
      if (p !== 0) return p;
      const ad = a.due_date ?? "9999-12-31";
      const bd = b.due_date ?? "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }
  return out;
}

/** Flat list: priority first, then earliest due date, then newest request. */
export function sortRequests(requests: readonly BrandingRequest[]): BrandingRequest[] {
  return [...requests].sort((a, b) => {
    const p = priorityRank(a.priority) - priorityRank(b.priority);
    if (p !== 0) return p;
    const ad = a.due_date ?? "9999-12-31";
    const bd = b.due_date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export type DueTone = "overdue" | "soon" | "ok" | "none";

/** Deadline colour for a row: overdue · due within 3 days · fine · no date. */
export function dueTone(due: string | null | undefined, today: string): DueTone {
  if (!due) return "none";
  const d = new Date(`${due}T12:00:00`).getTime();
  const t = new Date(`${today}T12:00:00`).getTime();
  if (!Number.isFinite(d) || !Number.isFinite(t)) return "none";
  const days = Math.round((d - t) / 86_400_000);
  if (days < 0) return "overdue";
  return days <= 3 ? "soon" : "ok";
}

/** Counts per status — the header strip. */
export function statusCounts(requests: readonly BrandingRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of [...ACTIVE_STATUSES, ...CLOSED]) out[s] = 0;
  for (const r of requests) {
    const key = isStatus(r.status) ? r.status : "open";
    out[key] += 1;
  }
  return out;
}

export const isOpen = (r: BrandingRequest): boolean => isStatus(r.status) && ACTIVE_STATUSES.includes(r.status as BrandingStatus);
