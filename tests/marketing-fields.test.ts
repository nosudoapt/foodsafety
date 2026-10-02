import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const board = readFileSync(
  join(__dirname, "../../src/components/MarketingBoard.tsx"),
  "utf8"
);
const sql = readFileSync(join(__dirname, "../../supabase/schema-marketing-fields.sql"), "utf8");

// Patch 8 — the promotion form collects these and the migration persists them.
const NEW_COLUMNS = ["category", "size", "person_name", "location_id"];

test("promotion form reads and writes the Patch 8 columns", () => {
  for (const col of NEW_COLUMNS) {
    assert.ok(board.includes(col), `MarketingBoard must persist ${col}`);
    assert.ok(sql.includes(col), `schema-marketing-fields.sql must add ${col}`);
  }
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS"), "the migration must be re-runnable");
});

test("location dropdown is populated from the locations table", () => {
  assert.ok(board.includes('from("locations")'), "the form must read the locations table");
  assert.ok(board.includes("All locations"), "an unscoped promotion must be possible");
  assert.ok(board.includes("Person Name"), "the form must ask who the material is for");
});

test("a database without the migration still renders the board", () => {
  // The legacy projection is the fallback read; without it the whole board
  // would blank out until someone runs the SQL.
  assert.ok(board.includes("PROMO_COLUMNS_LEGACY"), "keep the fallback projection");
  assert.ok(board.includes("legacySchema"), "the form must know when to hide the new inputs");
});
