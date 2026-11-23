import { test } from "node:test";
import assert from "node:assert/strict";
import { TASK_TYPES, assignmentProblem, taskLabel } from "../src/lib/btb-tasks";

const location = "20000000-0000-4000-8000-000000000001";
const employee = "50000000-0000-4000-8000-000000000001";

test("assigned duties accept only real dates, employees and task types", () => {
  assert.equal(assignmentProblem({ location_id: location, employee_id: employee, task_date: "2026-11-21", task_type: "temperature" }), null);
  assert.equal(assignmentProblem({ location_id: location, employee_id: employee, task_date: "2026-02-30", task_type: "temperature" }), "Choose a real task date.");
  assert.equal(assignmentProblem({ location_id: location, employee_id: "nope", task_date: "2026-11-21", task_type: "temperature" }), "Choose the employee.");
  assert.equal(assignmentProblem({ location_id: location, employee_id: employee, task_date: "2026-11-21", task_type: "inventory" }), "Choose a task.");
  assert.equal(assignmentProblem({ location_id: location, employee_id: employee, task_date: "2026-11-21", task_type: "cleaning", note: "x".repeat(501) }), "Keep the note under 500 characters.");
});

test("every duty has a visible label", () => {
  for (const type of TASK_TYPES) assert.equal(taskLabel(type.value), type.label);
  assert.equal(TASK_TYPES.length, 5);
});
