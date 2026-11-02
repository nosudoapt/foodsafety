import { test } from "node:test";
import assert from "node:assert/strict";
import { changedInventoryCounts, inventoryCountPayload, loadInventoryMonth } from "../src/lib/inventory-workspace";
import type { InventoryItem } from "../src/lib/month-end-inventory";

const id = "11111111-1111-4111-8111-111111111111";
const items: InventoryItem[] = [{ id, name: "Sesame buns", unit: "ea", unit_cost: 2, position: 1 }];
const stored = [{ item_id: id, count_month: "2026-10", qty: 4 }];

test("count saves preserve raw invalid drafts instead of replacing them with zero", () => {
  for (const qty of ["", "-1", "NaN", "4oops", "Infinity"]) {
    const draft = { [id]: qty };
    assert.equal(changedInventoryCounts(stored, draft), 1);
    assert.equal(inventoryCountPayload("2026-10", items, stored, draft).ok, false, qty);
  }
  const zero = inventoryCountPayload("2026-10", items, stored, { [id]: "0" });
  assert.ok(zero.ok);
  assert.deepEqual(zero.value.rows, [{ item_id: id, qty: 0 }]);
  assert.equal(changedInventoryCounts(stored, { [id]: "4.00" }), 0);
});

test("count saves combine untouched stored quantities and changed values", () => {
  const parsed = inventoryCountPayload("2026-10", items, stored, {});
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.rows, [{ item_id: id, qty: 4 }]);
  assert.equal(inventoryCountPayload("not-a-month", items, stored, {}).ok, false);
});

test("a failed required source rejects the entire inventory workspace", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    urls.push(input);
    const body = input.includes("inventory-items") ? { items } : input.includes("inventory-counts") ? { counts: stored, prevCounts: [], sales: "200" } : input.includes("inventory-opening") ? { opening: null, carriedFrom: null, baseline: true } : input.includes("inventory-purchases") ? { purchases: [] } : { error: "Snapshot unavailable" };
    return new Response(JSON.stringify(body), { status: input.includes("snapshot") ? 503 : 200 });
  });
  await assert.rejects(loadInventoryMonth("2026-10", new AbortController().signal), /Snapshot unavailable/);
  assert.equal(urls.length, 5);
});

test("complete inventory reads retain unknown opening and reject incomplete responses", async (t) => {
  let incomplete = false;
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const body = input.includes("inventory-items") ? { items } : input.includes("inventory-counts") ? { counts: stored, prevCounts: [], sales: "" } : input.includes("inventory-opening") ? { opening: null, carriedFrom: null, baseline: true } : input.includes("inventory-purchases") ? { purchases: [] } : incomplete ? {} : { snapshot: null };
    return new Response(JSON.stringify(body));
  });
  const data = await loadInventoryMonth("2026-10", new AbortController().signal);
  assert.equal(data.opening.opening, null);
  assert.equal(data.snapshot, null);
  assert.equal(data.sales, "");
  assert.equal(data.counts[0].qty, 4);
  incomplete = true;
  await assert.rejects(loadInventoryMonth("2026-10", new AbortController().signal), /incomplete/);
});
