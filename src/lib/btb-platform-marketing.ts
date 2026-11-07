// Shared, secret-free marketing workflow contracts. The SQL state machine in
// schema-btb-platform-marketing.sql is the authority; these helpers only decide
// which buttons a screen may *offer*. A designer never sees a bypass: approval
// is always corporate, and design work is only offered after approved_at exists.

export const MARKETING_ACTIONS = ["create", "submit", "approve", "reject", "assign", "start", "upload", "revision", "complete", "cancel", "comment", "calendar", "format", "platform"] as const;
export type MarketingAction = (typeof MARKETING_ACTIONS)[number];

export const PROMOTION_STATUSES = ["draft", "submitted", "pending_approval", "approved", "rejected", "assigned", "in_progress", "awaiting_feedback", "revision_requested", "completed", "cancelled"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending_approval: "Awaiting corporate approval",
  approved: "Approved - ready to assign",
  rejected: "Rejected",
  assigned: "Assigned to designer",
  in_progress: "In progress",
  awaiting_feedback: "Awaiting manager feedback",
  revision_requested: "Revision requested",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Tone for a status badge: never colour "pending approval" as success. */
export function promotionTone(status: PromotionStatus): "green" | "amber" | "red" | "purple" {
  if (status === "completed") return "green";
  if (status === "approved") return "green";
  if (status === "cancelled" || status === "rejected") return "red";
  if (status === "awaiting_feedback" || status === "revision_requested") return "purple";
  return "amber";
}

export interface Promotion {
  id: string;
  title: string;
  description: string | null;
  purpose: string | null;
  status: string;
  workflow_status: PromotionStatus;
  priority: string;
  dimensions: { width?: number; height?: number; unit?: string } | null;
  required_file_type: string | null;
  promotion_start: string | null;
  promotion_end: string | null;
  delivery_date: string | null;
  instructions: string | null;
  reference_files: string[] | null;
  approved_at: string | null;
  approved_by: string | null;
  assigned_to: string | null;
  decision_reason: string | null;
  version: number;
  btb_created_by: string | null;
  btb_created_by_name: string | null;
  completed_at: string | null;
}

export interface DesignVersion {
  id: string;
  promotion_id: string;
  file_id: string;
  file_name: string;
  mime: string;
  byte_size: number;
  version: number;
  title: string;
  notes: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface PromotionComment {
  id: string;
  promotion_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface PromotionEvent {
  id: string;
  entity_id: string;
  action: string;
  actor_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface SocialPost {
  id: string;
  promotion_id: string | null;
  design_version_id: string | null;
  title: string | null;
  campaign_name: string | null;
  channel: string;
  caption: string | null;
  scheduled_at: string | null;
  workflow_status: "planned" | "design_pending" | "awaiting_approval" | "approved" | "scheduled" | "published" | "cancelled";
  notes: string | null;
  version: number;
}

export interface MarketingData {
  promotions: Promotion[];
  assets: DesignVersion[];
  comments: PromotionComment[];
  history: PromotionEvent[];
  posts: SocialPost[];
  formats: { id: string; name: string; width: number | null; height: number | null; unit: string | null }[];
  platforms: string[];
  designers: { id: string; name: string }[];
}

export interface MarketingPerson {
  employeeId: string;
  role: string;
  name: string;
}

const CORPORATE = new Set(["corporate", "owner"]);

/**
 * The actions the API may offer for one promotion. Mirrors the SQL guards:
 * approval needs a different corporate approver; requesters cannot start or
 * upload; designers cannot approve, reject, assign others, or edit copy.
 */
export function marketingActions(promotion: Promotion | null, person: MarketingPerson): MarketingAction[] {
  if (!promotion) return ["create", "format", "platform"];
  const isDesigner = person.role === "designer";
  const corporate = CORPORATE.has(person.role);
  const creator = promotion.btb_created_by === person.employeeId;
  const assignee = promotion.assigned_to === person.employeeId;
  const actions: MarketingAction[] = ["comment"];
  if (isDesigner) {
    if (promotion.approved_at && (promotion.assigned_to === null || assignee) && ["approved", "assigned"].includes(promotion.workflow_status)) actions.push("assign");
    if (promotion.approved_at && assignee && ["assigned", "revision_requested"].includes(promotion.workflow_status)) actions.push("start");
    if (promotion.approved_at && assignee && ["in_progress", "awaiting_feedback"].includes(promotion.workflow_status)) actions.push("upload");
    if (assignee && promotion.workflow_status === "awaiting_feedback") actions.push("complete");
    if (!["completed", "cancelled", "pending_approval"].includes(promotion.workflow_status)) actions.push("revision");
    if (promotion.workflow_status !== "completed" && promotion.workflow_status !== "cancelled") actions.push("cancel");
    return actions;
  }
  if (promotion.workflow_status === "draft" || promotion.workflow_status === "rejected") actions.push("submit");
  if (promotion.workflow_status === "pending_approval") {
    if (corporate && !creator) actions.push("approve", "reject");
    else actions.push("reject");
  }
  if (promotion.approved_at) {
    if (["approved", "assigned"].includes(promotion.workflow_status)) actions.push("assign");
    if (["assigned", "in_progress", "revision_requested", "awaiting_feedback"].includes(promotion.workflow_status)) actions.push("start", "revision");
  }
  if (["awaiting_feedback", "revision_requested"].includes(promotion.workflow_status)) actions.push("upload");
  if (["awaiting_feedback", "completed"].includes(promotion.workflow_status)) actions.push("revision");
  if (promotion.workflow_status !== "completed" && promotion.workflow_status !== "cancelled") actions.push("cancel");
  if (promotion.approved_at && promotion.workflow_status !== "cancelled") actions.push("calendar");
  return actions;
}
