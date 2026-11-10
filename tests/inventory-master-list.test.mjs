// The master inventory list is the owner's workbook, and the rule around it is
// one sentence: names may be added, never taken away.
//
// These tests run the real migration against an in-process Postgres, so the
// append-only guarantee is checked where it actually lives — the trigger — and
// not merely asserted in TypeScript.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(new URL("../supabase/schema-inventory-master-list.sql", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/lib/inventory-master-list.ts", import.meta.url), "utf8");

// The prelude is schema-month-end-inventory.sql's table, minus the pieces this
// migration does not touch.
const inventoryItems = `
  CREATE TABLE inventory_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id UUID,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'ea',
    category TEXT,
    unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

async function migrate() {
  const db = new PGlite();
  await db.exec(inventoryItems);
  await db.exec(sql);
  return db;
}

test("the migration seeds every master item and re-runs without duplicating", async () => {
  const db = await migrate();
  const first = await db.query("SELECT count(*)::int AS n FROM inventory_items WHERE protected");
  const expected = Number(listSource.match(/export const MASTER_INVENTORY_COUNT = (\d+)/)?.[1]
    ?? listSource.match(/^export const MASTER_INVENTORY_ITEMS[\s\S]*?^];/m)?.[0].match(/\{ name:/g)?.length);
  assert.ok(expected > 200, `expected a sizeable list, parsed ${expected}`);
  assert.equal(first.rows[0].n, expected);

  await db.exec(sql);
  const second = await db.query("SELECT count(*)::int AS n FROM inventory_items");
  assert.equal(second.rows[0].n, expected, "a re-run must not duplicate rows");
  await db.close();
});

test("names are stored exactly as the sheet spells them", async () => {
  const db = await migrate();
  for (const name of ["Allo tiki", "7up", "Dr Pepper 2Ltr", "Pullock bites", "Hairnet", "Ice Cream, Vanilla"]) {
    const row = await db.query("SELECT name FROM inventory_items WHERE name = $1", [name]);
    assert.equal(row.rows.length, 1, `${name} should be seeded verbatim`);
  }
  // Whitespace-only differences are the one thing that should not create a twin.
  const twins = await db.query(
    "SELECT lower(trim(name)) AS key, count(*)::int AS n FROM inventory_items GROUP BY 1 HAVING count(*) > 1",
  );
  assert.deepEqual(twins.rows, [], "no name may appear twice");
  await db.close();
});

test("a master item cannot be deleted", async () => {
  const db = await migrate();
  await assert.rejects(
    () => db.exec("DELETE FROM inventory_items WHERE name = 'Allo tiki'"),
    /cannot be deleted/i,
  );
  const still = await db.query("SELECT count(*)::int AS n FROM inventory_items WHERE name = 'Allo tiki'");
  assert.equal(still.rows[0].n, 1);
  await db.close();
});

test("a master item cannot be renamed, since a rename is a deletion", async () => {
  const db = await migrate();
  await assert.rejects(
    () => db.exec("UPDATE inventory_items SET name = 'Allo Tiki' WHERE name = 'Allo tiki'"),
    /cannot be renamed/i,
  );
  await db.close();
});

test("a master item cannot be quietly unprotected and then dropped", async () => {
  const db = await migrate();
  await assert.rejects(
    () => db.exec("UPDATE inventory_items SET protected = false WHERE name = '7up'"),
    /cannot be unprotected/i,
  );
  await db.close();
});

test("correcting a master item's unit, category or cost is allowed", async () => {
  const db = await migrate();
  await db.exec(`
    UPDATE inventory_items SET unit = 'case', category = 'Dry Storage', unit_cost = 12.34
     WHERE name = 'Charcoal buns';
  `);
  const row = await db.query("SELECT unit, category, unit_cost::float8 AS unit_cost FROM inventory_items WHERE name = 'Charcoal buns'");
  assert.deepEqual(row.rows[0], { unit: "case", category: "Dry Storage", unit_cost: 12.34 });
  await db.close();
});

test("new items may be added, and those stay deletable", async () => {
  const db = await migrate();
  await db.exec("INSERT INTO inventory_items (name, unit, position) VALUES ('Birria consommé', 'L', 9999)");
  await db.exec("DELETE FROM inventory_items WHERE name = 'Birria consommé'");
  const gone = await db.query("SELECT count(*)::int AS n FROM inventory_items WHERE name = 'Birria consommé'");
  assert.equal(gone.rows[0].n, 0);
  await db.close();
});

test("an item the crew already typed by hand is protected, not duplicated", async () => {
  const db = new PGlite();
  await db.exec(inventoryItems);
  await db.exec("INSERT INTO inventory_items (name, unit, position) VALUES ('  rice  ', 'kg', 0)");
  await db.exec(sql);
  const rows = await db.query(
    "SELECT name, protected FROM inventory_items WHERE lower(trim(name)) = 'rice'",
  );
  assert.equal(rows.rows.length, 1, "the hand-typed row is adopted, not doubled");
  assert.equal(rows.rows[0].protected, true);
  assert.equal(rows.rows[0].name, "  rice  ", "adoption must not rewrite the existing name");
  await db.close();
});

test("every seeded unit is one the dropdown offers", async () => {
  const db = await migrate();
  const units = listSource.match(/export const INVENTORY_UNITS[\s\S]*?\] as const;/)?.[0] ?? "";
  const offered = new Set([...units.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]));
  assert.ok(offered.size >= 10);
  const used = await db.query("SELECT DISTINCT unit FROM inventory_items ORDER BY unit");
  for (const row of used.rows) {
    assert.ok(offered.has(row.unit), `unit "${row.unit}" is seeded but missing from the dropdown`);
  }
  await db.close();
});

test("sheet order survives, and re-running restores it", async () => {
  const db = await migrate();
  const order = await db.query("SELECT name FROM inventory_items WHERE protected ORDER BY position");
  assert.equal(order.rows[0].name, "Tortilla Wraps, 12In Salsa Flavor Flour, Frozen");
  assert.equal(order.rows.at(-1).name, "Maple pepper aioli");

  // A later edit that shuffles positions must not survive a re-run.
  await db.exec("UPDATE inventory_items SET position = 5000 WHERE name = 'Tortilla Wraps, 12In Salsa Flavor Flour, Frozen'");
  await db.exec(sql);
  const restored = await db.query("SELECT name FROM inventory_items WHERE protected ORDER BY position");
  assert.deepEqual(restored.rows, order.rows);
  await db.close();
});

test("hand-typed rows keep the top of the list, ahead of the catalogue", async () => {
  const db = new PGlite();
  await db.exec(inventoryItems);
  await db.exec("INSERT INTO inventory_items (name, unit, position) VALUES ('Beans', 'ea', 0), ('No seed buns', 'ea', 1)");
  await db.exec(sql);
  const rows = await db.query("SELECT name, position, protected FROM inventory_items ORDER BY position");
  assert.equal(rows.rows[0].name, "Beans");
  assert.equal(rows.rows[1].name, "No seed buns");
  assert.equal(rows.rows[0].protected, false, "hand-typed rows stay editable");
  assert.equal(rows.rows[2].name, "Tortilla Wraps, 12In Salsa Flavor Flour, Frozen");
  const positions = rows.rows.map((row) => row.position);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "positions must be strictly ordered");
  assert.equal(new Set(positions).size, positions.length, "positions must be unique");
  await db.close();
});