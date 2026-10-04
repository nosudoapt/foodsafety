import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRANDING_CATEGORIES,
  BRANDING_PRIORITIES,
  BRANDING_STATUSES,
  boardColumns,
  categoryLabel,
  dueTone,
  isOpen,
  isCategory,
  isPriority,
  isStatus,
  priorityAccent,
  priorityLabel,
  priorityRank,
  sortRequests,
  statusAccent,
  statusCounts,
  statusLabel,
  type BrandingRequest,
} from "../src/lib/branding-requests";

const req = (over: Partial<BrandingRequest> & { id: string }): BrandingRequest => ({
  title: "Drive-thru menu board",
  category: "menu",
  priority: "normal",
  status: "open",
  ...over,
});

test("statuses, priorities and categories are a closed set", () => {
  assert.deepEqual([...BRANDING_STATUSES], ["open", "in_review", "in_progress", "done", "declined"]);
  assert.equal(BRANDING_PRIORITIES.length, 4);
  assert.equal(BRANDING_CATEGORIES.length, 6);
  assert.equal(isStatus("in_review"), true);
  assert.equal(isStatus("waiting"), false);
  assert.equal(isPriority("urgent"), true);
  assert.equal(isPriority("asap"), false);
  assert.equal(isCategory("signage"), true);
  assert.equal(isCategory(null), false, "non-strings are rejected");
});

test("labels and colours read the way the cards do", () => {
  assert.equal(statusLabel("in_review"), "In review");
  assert.equal(statusLabel("in_progress"), "In progress");
  assert.equal(statusLabel("open"), "Open");
  assert.equal(priorityLabel("urgent"), "Urgent");
  assert.equal(categoryLabel("uniform"), "Uniform");
  assert.equal(statusAccent("open"), "red");
  assert.equal(statusAccent("done"), "green");
  assert.equal(statusAccent("declined"), "slate");
  assert.equal(priorityAccent("urgent"), "red");
  assert.equal(priorityAccent("normal"), "blue");
  assert.equal(priorityAccent("something_odd"), "slate", "unknown priority falls back");
});

test("priority ordering runs urgent → low", () => {
  assert.equal(priorityRank("urgent"), 0);
  assert.equal(priorityRank("high"), 1);
  assert.equal(priorityRank("normal"), 2);
  assert.equal(priorityRank("low"), 3);
  assert.equal(priorityRank("nope"), 2, "unknown lands with normal");
});

test("the board opens with active work, then the closed columns", () => {
  const board = boardColumns([
    req({ id: "d1", status: "done" }),
    req({ id: "o1", status: "open", priority: "low" }),
    req({ id: "u1", status: "open", priority: "urgent" }),
    req({ id: "x1", status: "waiting" }), // unknown status lands in Open
    req({ id: "r1", status: "in_review" }),
    req({ id: "c1", status: "declined" }),
  ]);
  assert.deepEqual(
    Object.keys(board),
    ["open", "in_review", "in_progress", "done", "declined"],
    "empty columns still exist so the board doesn't reflow",
  );
  assert.deepEqual(
    board["open"].map((r) => r.id),
    ["u1", "x1", "o1"],
    "urgent → normal (the status-less one) → low",
  );
  assert.equal(board["in_progress"].length, 0);
  assert.deepEqual(
    board["done"].map((r) => r.id),
    ["d1"],
  );
});

test("soonest due date wins inside a priority band", () => {
  const sorted = sortRequests([
    req({ id: "late", priority: "normal", due_date: "2026-10-01" }),
    req({ id: "noDate", priority: "normal" }),
    req({ id: "far", priority: "normal", due_date: "2026-12-01" }),
    req({ id: "urgent", priority: "urgent", due_date: "2026-12-31" }),
  ]);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["urgent", "late", "far", "noDate"],
    "undated requests sort last",
  );
});

test("due dates colour the row: overdue, within three days, fine", () => {
  const today = "2026-10-02";
  assert.equal(dueTone("2026-10-01", today), "overdue");
  assert.equal(dueTone("2026-10-02", today), "soon", "due today");
  assert.equal(dueTone("2026-10-05", today), "soon", "exactly three days");
  assert.equal(dueTone("2026-10-06", today), "ok");
  assert.equal(dueTone(null, today), "none");
  assert.equal(dueTone("", today), "none");
  assert.equal(dueTone("someday", today), "none", "junk dates don't crash the row");
});

test("the header strip counts every column, unknown statuses as open", () => {
  const counts = statusCounts([
    req({ id: "a", status: "open" }),
    req({ id: "b", status: "open" }),
    req({ id: "c", status: "done" }),
    req({ id: "d", status: "mystery" }),
  ]);
  assert.deepEqual(counts, { open: 3, in_review: 0, in_progress: 0, done: 1, declined: 0 });
  assert.equal(isOpen(req({ id: "a", status: "in_progress" })), true);
  assert.equal(isOpen(req({ id: "b", status: "done" })), false);
});
