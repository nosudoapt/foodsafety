import type { TrainingSection, TrainingTopic } from "./training";
import type { TeamMember } from "./btb-team";

export type BtbTrainingTopic = TrainingTopic & { revision: number };
export type TrainingStatus = "in_progress" | "pending" | "approved" | "changes_requested";
export type DisplayTrainingStatus = TrainingStatus | "not_started" | "needs_update";
export interface TrainingRecord {
  id: string; employee_id: string; topic_id: string; topic_revision: number;
  completed_sections: string[]; reviewed: boolean; status: TrainingStatus; notes: string;
  submitted_at: string | null; reviewed_at: string | null; reviewed_by_name: string | null;
  review_notes: string | null; version: number; updated_at: string;
}
export interface TrainingReview {
  id: string; record_id: string; employee_id: string; topic_id: string;
  decision: "approved" | "changes_requested"; reviewer_name: string; notes: string; created_at: string;
}
export interface TrainingData { topics: BtbTrainingTopic[]; sections: TrainingSection[]; records: TrainingRecord[]; employees: TeamMember[]; reviews: TrainingReview[] }
export const TRAINING_STATUS_LABELS: Record<DisplayTrainingStatus, string> = {
  not_started: "Not started", in_progress: "In progress", pending: "Awaiting manager", approved: "Approved", changes_requested: "Changes requested", needs_update: "Updated module · review again",
};
export function trainingStatus(record: TrainingRecord | undefined, topic: BtbTrainingTopic): DisplayTrainingStatus {
  if (!record) return "not_started";
  return record.topic_revision !== topic.revision ? "needs_update" : record.status;
}
export function employeeTrainingProgress(employeeId: string, topics: readonly BtbTrainingTopic[], records: readonly TrainingRecord[]) {
  const published = topics.filter((topic) => topic.published);
  const counts = { total: published.length, approved: 0, pending: 0, inProgress: 0, needsUpdate: 0, changesRequested: 0, percent: 0 };
  for (const topic of published) {
    const state = trainingStatus(records.find((record) => record.employee_id === employeeId && record.topic_id === topic.id), topic);
    if (state === "approved") counts.approved++;
    if (state === "pending") counts.pending++;
    if (state === "in_progress") counts.inProgress++;
    if (state === "needs_update") counts.needsUpdate++;
    if (state === "changes_requested") counts.changesRequested++;
  }
  counts.percent = counts.total ? Math.round(counts.approved / counts.total * 100) : 0;
  return counts;
}
export function validTrainingSelection(ids: unknown, sections: readonly TrainingSection[]): ids is string[] {
  return Array.isArray(ids) && new Set(ids).size === ids.length && ids.every((id) => typeof id === "string" && sections.some((section) => section.id === id));
}
