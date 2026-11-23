import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROUTES = [
  "inventory-items", "inventory-counts", "inventory-opening", "inventory-purchases",
  "inventory-snapshot", "inventory-summary", "inventory-finalize", "inventory-reopen",
];
const read = (path: string) => readFileSync(path, "utf8");

test("every inventory endpoint resolves the branch and refuses a request without one", () => {
  const lib = read("src/lib/btb-inventory-route.ts");
  assert.match(lib, /btbRequestLocation\(context, request\)/);
  assert.match(lib, /if \(!location\) throw new BtbApiError\(/);
  assert.match(lib, /handler\(\{ identity: context\.identity, location \}, request\)/);
});

test("no inventory endpoint falls back to the unowned rows any more", () => {
  for (const route of ROUTES) {
    const source = read(`src/app/api/btb/${route}/route.ts`);
    assert.ok(!source.includes('.is("location_id", null)'), `${route} still reads location_id IS NULL`);
    assert.match(source, /locationId/, `${route} never mentions the branch`);
  }
});

test("writes are stamped with the server's branch, never a client-supplied one", () => {
  const items = read("src/app/api/btb/inventory-items/route.ts");
  assert.match(items, /location_id: locationId/);
  const counts = read("src/app/api/btb/inventory-counts/route.ts");
  assert.match(counts, /location_id: locationId/);
  const summary = read("src/app/api/btb/inventory-summary/route.ts");
  assert.match(summary, /location_id: locationId/);
  for (const route of ROUTES) {
    const source = read(`src/app/api/btb/${route}/route.ts`);
    assert.ok(!/location_id:\s*(body|req|request)\b/.test(source), `${route} trusts a client location`);
  }
});

test("a finalized month and an item's finalized history are checked inside the branch", () => {
  const guards = read("src/lib/inventory-server-guards.ts");
  assert.match(guards, /requireEditableMonth\(db: SupabaseClient, month: string, locationId: string\)/);
  assert.match(guards, /requireItemWithoutFinalizedHistory\([\s\S]{0,120}locationId: string/);
  assert.ok(!guards.includes('.is("location_id", null)'));
});

test("finalize and reopen key the snapshot by branch, so two branches can close one month", () => {
  const finalize = read("src/app/api/btb/inventory-finalize/route.ts");
  assert.match(finalize, /scope_key: locationId/);
  assert.match(finalize, /location_id: locationId/);
  assert.match(finalize, /onConflict: "count_month,scope_key"/);
  const reopen = read("src/app/api/btb/inventory-reopen/route.ts");
  assert.match(reopen, /location_id: locationId/);
});

test("the header names the branch instead of claiming a company-wide figure", () => {
  const view = read("src/app/btb/demo/month-end-inventory/view.tsx");
  assert.match(view, /data\?\.location \? <Badge/);
  const items = read("src/app/api/btb/inventory-items/route.ts");
  assert.match(items, /location: \{ id: scope\.location\.id, name: scope\.location\.name/);
});

test("the release backfills Drumheller and keeps the branches apart in the database", () => {
  const sql = read("supabase/schema-btb-inventory-location-scope.sql");
  assert.match(sql, /slug = 'drumheller'/);
  assert.match(sql, /inventory_snapshots_branch_month/);
  assert.match(sql, /inventory_counts_branch_item_month/);
  assert.match(sql, /inventory_items_branch_name/);
  assert.match(sql, /scope_key = location_id::text/);
  assert.match(sql, /btb_inventory_seed_items/);
  const manifest = JSON.parse(read("supabase/migrations.json")) as { steps: { step: number; file: string }[] };
  assert.ok(manifest.steps.some((entry) => entry.file === "schema-btb-inventory-location-scope.sql"));
});
