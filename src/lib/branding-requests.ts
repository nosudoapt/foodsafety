// Branding Requests — statuses, priorities, board ordering and due-date tone.
// Pure helpers shared by the board page and its tests.

export const BRANDING_STATUSES = ["open", "in_review", "in_progress", "done", "declined"] as const;
export type BrandingStatus = (typeof BRANDING_STATUSES)[number];

export const BRANDING_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type BrandingPriority = (typeof BRANDING_PRIORITIES)[number];

export const BRANDING_CATEGORIES = ["uniform", "serving_trays", "hats", "gift_cards", "flyers", "display_board", "caddies", "table_numbers"] as const;
export type BrandingCategory = (typeof BRANDING_CATEGORIES)[number];

// Values saved before the category revamp — still accepted so old cards keep
// their meaning, but no longer offered in the form.
const LEGACY_CATEGORIES = ["signage", "menu", "packaging", "digital", "other"] as const;

/** Keep the stored category key compatible with existing requests. */
export const BRANDING_SIZES: Record<string, readonly string[]> = {
  uniform: ["S", "M", "L", "XL", "XXL", "XXXL"],
  serving_trays: ["Small", "Large"],
};

export function sizesFor(category: string): readonly string[] {
  return BRANDING_SIZES[category] ?? [];
}

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
  /** Size detail — T-shirt S–XXXL or tray Small/Large, otherwise null. */
  size?: string | null;
  /** Quantity for single-item requests (legacy cards); capped per item. */
  qty?: number | null;
  /** Combo request lines — several items filed by one location together. */
  items?: BrandingLine[] | null;
  /** Reply-to email for the requester — used by the Email designer button. */
  contact_email?: string | null;
  /** Optional pinned file (base64 data URL) + original name. */
  file_url?: string | null;
  file_name?: string | null;
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
  return (
    typeof v === "string" &&
    ((BRANDING_CATEGORIES as readonly string[]).includes(v) ||
      (LEGACY_CATEGORIES as readonly string[]).includes(v))
  );
}

const label = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export const statusLabel = (v: string): string => {
  if (v === "in_review") return "In review";
  if (v === "in_progress") return "In progress";
  return label(v);
};

export const priorityLabel = label;

/** Card badge for a category: T-shirt, Serving trays, Bun display board … */
export const categoryLabel = (v: string): string => {
  if (v === "uniform") return "T-shirt";
  if (v === "serving_trays") return "Serving trays";
  if (v === "gift_cards") return "Gift cards";
  if (v === "display_board") return "Bun display board";
  if (v === "caddies") return "Caddies";
  if (v === "hats") return "Hats";
  if (v === "table_numbers") return "Table numbers";
  if (v === "flyers") return "Flyers";
  return label(v);
};

/** Maximum quantity per item (per size where sizes apply). Flyers are ordered
 * in print runs — see FLYER_RUNS — so they have no single numeric cap. */
export const BRANDING_QTY_LIMITS: Record<string, number> = {
  uniform: 10,
  serving_trays: 30,
  hats: 10,
  gift_cards: 100,
  display_board: 1,
  caddies: 20,
  table_numbers: 12,
};

/** Flyers are printed in runs of 5k / 10k, up to 25k. */
export const FLYER_RUNS = [5_000, 10_000, 15_000, 20_000, 25_000] as const;

/** The largest quantity a category accepts (undefined = flyers, run-based). */
export function qtyLimitFor(category: string): number | undefined {
  return BRANDING_QTY_LIMITS[category];
}

/** Clamp a quantity to the item's cap; flyers snap to a print run. */
export function capQty(category: string, qty: number): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (category === "flyers") {
    const run = FLYER_RUNS.find((option) => option >= qty);
    return run ?? FLYER_RUNS[FLYER_RUNS.length - 1];
  }
  const limit = qtyLimitFor(category);
  return limit ? Math.min(Math.floor(qty), limit) : Math.floor(qty);
}

/** One line of a combo request — several items filed by a location together. */
export interface BrandingLine {
  category: string;
  /** Size detail where it applies (T-shirt size, tray size), else null. */
  size: string | null;
  /** Quantity capped by BRANDING_QTY_LIMITS; flyers use print runs (5k–25k). */
  qty: number | null;
}

/** Parse the `items` JSONB of a combo request: one or more valid lines. */
export function parseBrandingLines(input: unknown): { value: BrandingLine[]; error?: never } | { error: string; value?: never } {
  if (!Array.isArray(input) || input.length === 0 || input.length > 25) return { error: "Add at least one item line (up to 25 per combo request)." };
  const lines: BrandingLine[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "One of the item lines could not be read. Try again." };
    const line = raw as Record<string, unknown>;
    if (typeof line.category !== "string" || !isCategory(line.category)) return { error: "Choose a valid item type for every line." };
    const sizes = sizesFor(line.category);
    if (line.size != null && (typeof line.size !== "string" || !sizes.includes(line.size))) return { error: `Choose a valid size for ${categoryLabel(line.category)}.` };
    const qty = capQty(line.category, typeof line.qty === "number" ? line.qty : NaN);
    if (qty === null) return { error: `Enter a quantity for ${categoryLabel(line.category)}${line.size ? ` (${line.size})` : ""}.` };
    lines.push({ category: line.category, size: line.size ?? null, qty });
  }
  return { value: lines };
}

/** Short human summary of one line, e.g. "T-shirt (L) × 10". */
export function brandingLineLabel(line: BrandingLine): string {
  const qty = line.category === "flyers" && line.qty ? line.qty.toLocaleString("en-CA") : line.qty;
  return `${categoryLabel(line.category)}${line.size ? ` (${line.size})` : ""} × ${qty}`;
}

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
