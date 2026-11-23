import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canViewEditLog, diffSheet, EDIT_LOG_DAYS, type EditEntry } from "../src/lib/btb-edit-log";

const base: Omit<EditEntry, "section" | "item_name" | "field" | "old_value" | "new_value"> = {
  tenant_id: "Between the Buns", location_id: "11111111-1111-4111-8111-111111111111",
  area: "prep", sheet_date: "2026-11-20", actor_id: null, actor_name: "Kapil", actor_role: "staff",
};

test("only owner, supervisor and corporate may read the edit log", () => {
  for (const role of ["owner", "supervisor", "corporate"]) assert.equal(canViewEditLog(role), true, role);
  for (const role of ["manager", "staff", "kitchen", ""]) assert.equal(canViewEditLog(role), false, role);
});

test("the log keeps 45 days", () => assert.equal(EDIT_LOG_DAYS, 45));

test("one entry per changed field, with no entry for unchanged values", () => {
  const entries = diffSheet(
    { "chopped-lettuce": { OH: "0", Done: "false" } },
    { "chopped-lettuce": { OH: "0", Done: "true" } },
    base,
    () => "Produce",
  );
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { ...base, section: "Produce", item_name: "chopped-lettuce", field: "Done", old_value: "false", new_value: "true" });
});

test("an item added since the last save reads as empty → value", () => {
  const entries = diffSheet({}, { "diced-onion": { OH: "7" } }, base, () => "Produce");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].old_value, null);
  assert.equal(entries[0].new_value, "7");
});

test("blank and missing are the same value, so clearing then saving is not a change", () => {
  assert.equal(diffSheet({ a: { OH: "" } }, { a: {} }, base, () => "Produce").length, 0);
  assert.equal(diffSheet({ a: { OH: " " } }, { a: {} }, base, () => "Produce").length, 0);
});

test("an item removed from the sheet is recorded as value → empty", () => {
  const entries = diffSheet({ "old-item": { PAR: "4" } }, {}, base, () => "Starches");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].new_value, null);
  assert.equal(entries[0].section, "Starches");
});

test("the section comes from where the item sits on this sheet", () => {
  const entries = diffSheet({ a: { PAR: "1" }, b: { PAR: "1" } }, { a: { PAR: "2" }, b: { PAR: "2" } }, base, (item) => (item === "a" ? "Produce" : "Meats"));
  assert.deepEqual(entries.map((entry) => entry.section).sort(), ["Meats", "Produce"]);
});

test("a very large sheet is capped so one save cannot flood the log", () => {
  const before: Record<string, Record<string, string>> = {};
  const after: Record<string, Record<string, string>> = {};
  for (let index = 0; index < 600; index += 1) { after[`item-${index}`] = { OH: "1" }; }
  assert.equal(diffSheet(before, after, base, () => "Produce").length, 400);
});

test("both sheets record under their own area and the right roles read them", () => {
  const source = readFileSync("src/app/api/btb/orders/route.ts", "utf8");
  assert.match(source, /area: "order"/);
  assert.match(source, /canViewEditLog\(identity\.role\)/);
});

test("the panel is gated by the server's answer, never by the browser's guess", () => {
  const panel = readFileSync("src/components/btb/EditLogPanel.tsx", "utf8");
  assert.match(panel, /allowed !== true\) return null/);
  assert.match(panel, /permission=1/);
  const prep = readFileSync("src/app/btb/demo/prep-list/prep-sheet.tsx", "utf8");
  assert.match(prep, /sheet\?\.canViewEditLog && <EditLogPanel/);
});
