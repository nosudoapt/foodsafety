import { isIsoDate, isUuid } from "./btb-team";

export const TASK_TYPES = [
  { value: "temperature", label: "Temperature log" },
  { value: "prep_sheet", label: "Prep sheet" },
  { value: "opening", label: "Opening checklist" },
  { value: "closing", label: "Closing checklist" },
  { value: "cleaning", label: "Cleaning schedule" },
] as const;
export type TaskType = (typeof TASK_TYPES)[number]["value"];

export interface TaskAssignment {
  id: string;
  location_id: string;
  employee_id: string;
  employee_name?: string;
  task_date: string;
  task_type: TaskType;
  note: string;
  completed: boolean;
  version?: number;
}

export const taskLabel = (type: string): string => TASK_TYPES.find((item) => item.value === type)?.label ?? type;

/** Validate one manager-entered assignment; dates are real ISO dates. */
export function assignmentProblem(input: Record<string, unknown>): string | null {
  if (!isUuid(input.location_id)) return "Choose the branch.";
  if (!isUuid(input.employee_id)) return "Choose the employee.";
  if (!isIsoDate(input.task_date)) return "Choose a real task date.";
  if (!TASK_TYPES.some((item) => item.value === input.task_type)) return "Choose a task.";
  if (input.note != null && (typeof input.note !== "string" || input.note.length > 500)) return "Keep the note under 500 characters.";
  return null;
}
