import type { Promotion } from "@/lib/btb-platform-marketing";

export interface Person {
  employeeId: string;
  name: string;
  role: string;
}

export const formatDate = (value: string | null): string =>
  value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-CA", { dateStyle: "medium" }) : "Not set";

export const formatStamp = (value: string | null): string =>
  value ? new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "Not set";

/** The one step this person can take now, or null when they are only watching. */
export function nextStep(promotion: Promotion, person: Person): { action: string; label: string } | null {
  const corporate = person.role === "corporate" || person.role === "owner";
  const designer = person.role === "designer";
  const assignee = promotion.assigned_to === person.employeeId;
  const creator = promotion.btb_created_by === person.employeeId;
  if (promotion.workflow_status === "draft" || promotion.workflow_status === "rejected") {
    return designer ? null : { action: "submit", label: "Submit for corporate approval" };
  }
  if (promotion.workflow_status === "pending_approval") {
    if (corporate && !creator) return { action: "approve", label: "Approve request" };
    if (corporate && creator) return { action: "reject", label: "Reject (a different approver is required)" };
    return null;
  }
  if (promotion.approved_at && ["approved", "assigned"].includes(promotion.workflow_status)) {
    if (canStart(designer, assignee, promotion)) return { action: "start", label: "Start design" };
    if (!designer && !promotion.assigned_to) return { action: "assign", label: "Assign to a designer" };
  }
  if (promotion.approved_at && promotion.workflow_status === "in_progress" && designer && assignee) {
    return { action: "upload", label: "Upload artwork" };
  }
  return null;
}

const canStart = (designer: boolean, assignee: boolean, promotion: Promotion) =>
  designer && assignee && promotion.workflow_status === "assigned";
