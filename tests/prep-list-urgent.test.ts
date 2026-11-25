import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepCategoryItems } from "../src/lib/btb-prep";

const page = readFileSync(
  join(__dirname, "../../src/app/btb/demo/prep-list/prep-sheet.tsx"),
  "utf8"
);
const api = readFileSync(
  join(__dirname, "../../src/app/api/btb/prep/route.ts"),
  "utf8"
);
const schema = readFileSync(join(__dirname, "../../supabase/schema-locations.sql"), "utf8");

// The sheet moved to the server: Urgent is now a manager decision stored on the
// week's PAR row, staff see it read-only, and the API writes the boolean.

test("managers toggle Urgent on a row, staff only see the flag", () => {
  assert.ok(page.includes("aria-label={`${item.name} urgent`}"), "the manager checkbox needs a per-item label");
  assert.ok(page.includes("void toggleUrgent(section.category, item)"), "toggling must reach the server");
  assert.ok(/item\.urgent \? <span className="prep-urgent">Urgent<\/span>/.test(page), "staff see the flag as a badge");
  assert.ok(api.includes("urgent: body.urgent === true"), "the API stores the boolean, not the browser");
});

test("the flag survives a reload — it is part of the week's PAR levels", () => {
  assert.ok(api.includes("urgent: boolean"), "PAR levels carry the urgent flag");
  assert.ok(api.includes('action === "add-item"'), "an urgent change is saved through add-item");
  assert.ok(api.includes(".upsert({") && api.includes("btb_prep_par_levels"), "the row is upserted per branch and week");
});

test("the database column exists", () => {
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS — no new migration needed.
  assert.ok(
    /ALTER TABLE prep_counts\s+ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE/.test(schema),
    "prep_counts.urgent must exist with DEFAULT false"
  );
});

test("a week with no PAR levels still renders the printed catalog", () => {
  // Rows come from btb_prep_par_levels (per location + week). A location whose
  // week is not set yet had zero rows, so the sheet looked empty. The route now
  // falls back to the printed catalog for sections with no saved levels.
  assert.ok(api.includes("function prepRowsFor("), "the route has a catalog fallback");
  assert.ok(api.includes("prepCategoryItems(category)"), "the fallback uses the printed catalog");
  assert.ok(
    api.includes("if (saved.length) return saved;")
      || api.includes("for (const leftover of byKey.values()) catalog.push(leftover)"),
    "saved levels are preserved and custom rows are never dropped"
  );

  // The catalog itself must be non-trivial — this is what the fallback serves.
  const produce = prepCategoryItems("Produce");
  assert.ok(produce.length >= 10, `Produce has its printed rows, got ${produce.length}`);
  assert.ok(prepCategoryItems("Sauces").length >= 8, "Sauces has its printed rows");
  assert.ok(prepCategoryItems("Meats").length >= 8, "Meats has its printed rows");
});
