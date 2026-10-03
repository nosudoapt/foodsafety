import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(
  join(__dirname, "../../src/app/between-the-buns/prep-list/page.tsx"),
  "utf8"
);
const schema = readFileSync(join(__dirname, "../../supabase/schema-locations.sql"), "utf8");

// The client asked for the Urgent flag back on the 3-column sheet: a checkbox
// beside every item name, saved to prep_counts.urgent and pre-filled on load.

test("every item row renders an Urgent checkbox next to the name", () => {
  assert.ok(page.includes('aria-label={`Urgent: ${item.name}`}'), "checkbox needs a per-item label");
  assert.ok(page.includes('title="Urgent"'), "the checkbox needs a hover title");
  // One checkbox serves all three columns — it lives in Row, not per-column.
  assert.ok(page.includes("updateEntry(key, \"urgent\", ev.target.checked)"), "toggling must hit state");
  assert.ok(page.includes("checked={e.urgent}"), "the checkbox must reflect state");
});

test("the flag survives a reload — read with the sheet, written on save", () => {
  assert.ok(page.includes('select("id, item_name, par, on_hand, urgent")'), "load reads urgent");
  assert.ok(page.includes("urgent: !!row.urgent"), "load pre-fills the checkbox");
  assert.ok(page.includes("urgent: e.urgent"), "save persists the boolean");
  assert.ok(page.includes("e.urgent,"), "an urgent-only row still counts as filled");
});

test("the database column exists", () => {
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS — no new migration needed.
  assert.ok(
    /ALTER TABLE prep_counts\s+ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE/.test(schema),
    "prep_counts.urgent must exist with DEFAULT false"
  );
});
