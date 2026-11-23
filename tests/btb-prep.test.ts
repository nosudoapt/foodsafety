import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSeePrepPar, isPrepCategory, parWeekStart, PREP_CATEGORIES, PREP_HISTORY_DAYS,
  prepCategoryItems, prepCategoryMode, prepSubmitState, prepSubmissionNotice, visiblePrepCategories,
} from "../src/lib/btb-prep";

test("the six printed sections are the only prep categories", () => {
  assert.deepEqual([...PREP_CATEGORIES], ["Produce", "Starches", "Sauces", "Meats", "Freezer pull", "Dairy"]);
  assert.equal(isPrepCategory("Produce"), true);
  assert.equal(isPrepCategory("produce"), false);
  assert.equal(isPrepCategory("Everything"), false);
  assert.equal(PREP_HISTORY_DAYS, 45);
});

test("every section resolves its printed rows and column shape", () => {
  const produce = prepCategoryItems("Produce");
  assert.ok(produce.length >= 10);
  assert.equal(produce[0].name, "Burger Tomatoes");
  assert.equal(produce[0].unit, "1/6 S");
  assert.equal(prepCategoryMode("Produce"), "par");
  assert.equal(prepCategoryMode("Freezer pull"), "pull");
});

test("the PAR week starts on Friday so Friday covers Friday to Thursday", () => {
  // 2026-11-27 is a Friday.
  assert.equal(parWeekStart("2026-11-27"), "2026-11-27");
  assert.equal(parWeekStart("2026-11-28"), "2026-11-27"); // Saturday
  assert.equal(parWeekStart("2026-11-30"), "2026-11-27"); // Monday
  assert.equal(parWeekStart("2026-12-03"), "2026-11-27"); // Thursday
  assert.equal(parWeekStart("2026-12-04"), "2026-12-04"); // next Friday
});

test("staff see only their assigned sections and never PAR", () => {
  assert.deepEqual(visiblePrepCategories("staff", ["Produce"]), ["Produce"]);
  assert.deepEqual(visiblePrepCategories("staff", []), []);
  assert.deepEqual(visiblePrepCategories("manager", []), [...PREP_CATEGORIES]);
  assert.deepEqual(visiblePrepCategories("supervisor", []), [...PREP_CATEGORIES]);
  assert.equal(canSeePrepPar("staff"), false);
  assert.equal(canSeePrepPar("manager"), true);
  assert.equal(canSeePrepPar("supervisor"), true);
});

test("a submission is complete only when every visible row is ticked", () => {
  assert.deepEqual(prepSubmitState([{ key: "a", done: true }, { key: "b", done: true }]), { complete: true, missing: 0 });
  assert.deepEqual(prepSubmitState([{ key: "a", done: true }, { key: "b", done: false }]), { complete: false, missing: 1 });
  // An empty sheet is never "complete": there is nothing to confirm.
  assert.deepEqual(prepSubmitState([]), { complete: false, missing: 0 });
});

test("the manager notice names the person, the sections and what is missing", () => {
  assert.equal(prepSubmissionNotice("Kapil", ["Produce"], 0), "Kapil submitted Produce: everything is complete.");
  assert.equal(prepSubmissionNotice("Micky", ["Produce", "Dairy"], 1), "Micky submitted Produce, Dairy with 1 item not ticked.");
  assert.equal(prepSubmissionNotice("Micky", [], 2), "Micky submitted no sections with 2 items not ticked.");
});
