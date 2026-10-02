import { test } from "node:test";
import assert from "node:assert/strict";
import { itemKey, parKeys, prepCatalog, prepColumns } from "../src/lib/btb-prep-list";

// The sheet is a transcription of the client's printed form — these counts and
// labels are the contract, so a typo or a dropped row fails here, not on a
// tablet in the kitchen.

test("three columns with the printed headings and column shapes", () => {
  assert.deepEqual(
    prepColumns.map((c) => `${c.label}:${c.mode}`),
    ["Produce & Starches:par", "Sauces & Meats:par", "Freezer pull & Dairy:pull"],
  );
  assert.deepEqual(
    prepColumns.map((c) => c.sections.map((s) => s.title)),
    [
      ["Produce", "Starches"],
      ["Sauces", "Meats"],
      ["Freezer pull", "Dairy"],
    ],
  );
});

test("every transcribed row is present, in order", () => {
  const count = (col: number, section: number) => prepColumns[col].sections[section].items.length;
  assert.equal(count(0, 0), 14, "Produce");
  assert.equal(count(0, 1), 5, "Starches");
  assert.equal(count(1, 0), 11, "Sauces");
  assert.equal(count(1, 1), 10, "Meats");
  assert.equal(count(2, 0), 16, "Freezer pull");
  assert.equal(count(2, 1), 2, "Dairy");
  assert.equal(prepCatalog.length, 58);
  assert.equal(prepCatalog[0], "Burger Tomatoes");
  assert.equal(prepCatalog[prepCatalog.length - 1], "ice cream portion");
});

test("row keys are unique — Turkey is a meat portion AND a freezer pull", () => {
  const seen = new Set<string>();
  for (const col of prepColumns) {
    for (const section of col.sections) {
      for (const item of section.items) {
        const key = itemKey(item);
        assert.ok(!seen.has(key), `duplicate key "${key}"`);
        seen.add(key);
      }
    }
  }
  assert.ok(prepCatalog.includes("Turkey"), "Meats Turkey stays plain");
  assert.ok(prepCatalog.includes("Turkey (freezer)"), "freezer Turkey is disambiguated");
});

test("only the par columns carry Par — prefill and the manager gate skip the freezer", () => {
  assert.equal(parKeys.length, 40, "14 + 5 + 11 + 10");
  assert.ok(parKeys.includes("Romaine"));
  assert.ok(parKeys.includes("Elk patty"));
  assert.ok(!parKeys.includes("Broiche buns"));
  assert.ok(!parKeys.includes("Cheese curds"));
});
