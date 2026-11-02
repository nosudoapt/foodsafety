import { canonicalCheckItems, type AttributedCheckItem, type CheckType } from "./btb-operations";
import { isVersion } from "./btb-team";

export interface CheckDraft { version: number; changes: Record<string, boolean>; notes?: string }
export const checkDraftKey = (employee: string, date: string, type: CheckType) => `btb:checks:v2:${employee}:${date}:${type}`;

export function parseCheckDraft(value: string | null, type: CheckType): CheckDraft | null {
  try {
    const draft = JSON.parse(value ?? "null") as CheckDraft | null;
    if (!draft || !isVersion(draft.version) || !draft.changes || typeof draft.changes !== "object" || Array.isArray(draft.changes) || (draft.notes !== undefined && (typeof draft.notes !== "string" || draft.notes.length > 2000))) return null;
    const ids = new Set(canonicalCheckItems(type).map((item) => item.id));
    if (Object.entries(draft.changes).some(([id, done]) => !ids.has(id) || typeof done !== "boolean")) return null;
    return draft;
  } catch { return null; }
}

export function previewChecks(type: CheckType, saved: readonly AttributedCheckItem[], draft: CheckDraft | null, name: string): AttributedCheckItem[] {
  return canonicalCheckItems(type, saved).map((item) => {
    const completed = draft?.changes[item.id];
    if (completed === undefined || completed === item.completed) return item;
    return { ...item, completed, completed_by: null, completed_by_name: completed ? `${name} · not saved` : null, completed_at: null };
  });
}
