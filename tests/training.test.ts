import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRAINING_CATEGORIES,
  categoryLabel,
  groupByCategory,
  isTrainingCategory,
  matchesQuery,
  nextPosition,
  orderedSections,
  parseBody,
  readingMinutes,
  totalMinutes,
  type TrainingTopic,
} from "../src/lib/training";

const topic = (over: Partial<TrainingTopic> = {}): TrainingTopic => ({
  id: over.id ?? "t1",
  title: over.title ?? "Cooling chicken",
  category: over.category ?? "food_safety",
  est_minutes: over.est_minutes ?? 5,
  published: over.published ?? true,
  position: over.position ?? 0,
});

test("a section body splits into paragraphs plus its checklist", () => {
  const { paragraphs, checklist } = parseBody(
    ["Cook to 74°C / 165°F.", "", "Then chill fast:", "- blast chill within 2 hours", "* log the time", "- [ ] sign the sheet", "", "Questions? Ask the manager."].join("\n"),
  );
  assert.deepEqual(paragraphs, [
    "Cook to 74°C / 165°F.",
    "Then chill fast:",
    "Questions? Ask the manager.",
  ]);
  assert.deepEqual(checklist, ["blast chill within 2 hours", "log the time", "sign the sheet"]);
  assert.deepEqual(parseBody("").paragraphs, [], "empty body is empty");
  assert.deepEqual(parseBody("- only a list").checklist, ["only a list"], "checklist-only body");
});

test("reading time is 200 words per minute, never zero", () => {
  assert.equal(readingMinutes(""), 1, "an empty body still earns a minute");
  assert.equal(readingMinutes(Array.from({ length: 200 }, () => "word").join(" ")), 1);
  assert.equal(readingMinutes(Array.from({ length: 450 }, () => "word").join(" ")), 2);
});

test("search matches title, category and body — case-insensitively", () => {
  const t = topic({ title: "Walk-in Fridge Log" });
  const body = "Record the temperature twice a shift.";
  assert.equal(matchesQuery(t, body, "fridge"), true);
  assert.equal(matchesQuery(t, body, "TEMPERATURE"), true, "body text is searched too");
  assert.equal(matchesQuery(t, body, "food_safety"), true, "category is searchable");
  assert.equal(matchesQuery(t, body, "  "), true, "blank query shows everything");
  assert.equal(matchesQuery(t, body, "pool"), false);
});

test("topics group by category and keep their roster order", () => {
  const groups = groupByCategory([
    topic({ id: "b", category: "cleaning", position: 1 }),
    topic({ id: "a", category: "food_safety", position: 0 }),
    topic({ id: "c", category: "food_safety", position: 5 }),
    topic({ id: "d", category: "records", position: 2 }), // unknown bucket
    topic({ id: "e", category: "cleaning", position: 3 }),
  ]);
  assert.deepEqual(Object.keys(groups), ["food_safety", "cleaning", "other"], "in first-seen order");
  assert.deepEqual(groups["food_safety"].map((t) => t.id), ["a", "c"]);
  assert.deepEqual(groups["cleaning"].map((t) => t.id), ["b", "e"]);
  assert.deepEqual(groups["other"].map((t) => t.id), ["d"]);
  assert.deepEqual(groupByCategory([]), {}, "no topics → no groups");
});

test("new topics and sections land at the end", () => {
  assert.equal(nextPosition([]), 0, "first item is position 0");
  assert.equal(nextPosition([{ position: 0 }, { position: 2 }]), 3);
  assert.equal(nextPosition([{ position: 0 }]), 1);
});

test("sections render in stored order even if the DB returns them shuffled", () => {
  assert.deepEqual(
    orderedSections([
      { position: 2 },
      { position: 0 },
      { position: 1 },
    ]).map((s) => s.position),
    [0, 1, 2],
  );
});

test("the guide's categories are a closed set with friendly labels", () => {
  assert.equal(TRAINING_CATEGORIES.length, 5);
  assert.equal(isTrainingCategory("food_safety"), true);
  assert.equal(isTrainingCategory("records"), false);
  assert.equal(categoryLabel("cleaning"), "Cleaning");
  assert.equal(categoryLabel("haccap"), "Haccap", "free-text passes through");
  assert.equal(
    totalMinutes([topic({ est_minutes: 5 }), topic({ est_minutes: 12 }), topic({ est_minutes: -3 })]),
    17,
    "negative estimates can't shrink the total",
  );
});
