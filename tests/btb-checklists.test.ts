import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checklistProgress,
  defaultClosingItems,
  defaultOpeningItems,
} from "../src/lib/btb-checklists";

// The Daily Kitchen Checks page and the prep sheet's Opening/Closing tab both
// render these lists — a malformed default would break both at once.

test("opening and closing defaults are complete, unique and unticked", () => {
  const all = [...defaultOpeningItems, ...defaultClosingItems];
  assert.equal(defaultOpeningItems.length, 20);
  assert.equal(defaultClosingItems.length, 20);

  const ids = new Set<string>();
  for (const item of all) {
    assert.ok(item.id, "every item needs an id");
    assert.ok(item.text.trim(), `item ${item.id} needs text`);
    assert.ok(item.section === "Front" || item.section === "Kitchen", `${item.id} section`);
    assert.equal(item.completed, false, `${item.id} starts unticked`);
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
  }
});

test("each list has both a Front and a Kitchen section", () => {
  for (const [name, list] of [
    ["opening", defaultOpeningItems],
    ["closing", defaultClosingItems],
  ] as const) {
    const sections = new Set(list.map((i) => i.section));
    assert.deepEqual([...sections].sort(), ["Front", "Kitchen"], `${name} sections`);
  }
});

test("checklistProgress counts only ticked items", () => {
  assert.deepEqual(checklistProgress(defaultOpeningItems), { done: 0, total: 20 });
  const ticked = defaultClosingItems.map((i, idx) => (idx < 5 ? { ...i, completed: true } : i));
  assert.deepEqual(checklistProgress(ticked), { done: 5, total: 20 });
  // The inputs are not mutated — the page keeps its defaults pristine.
  assert.equal(defaultClosingItems.filter((i) => i.completed).length, 0);
});
