import { test } from "node:test";
import assert from "node:assert/strict";
import { BTB_CARDS } from "../src/lib/btb-hub";
import { accessibleBtbCards, btbCardForPath, btbPageAllowed, validateAccessChanges, type BtbPageAccess } from "../src/lib/btb-page-access";
import { btbDateWindow } from "../src/lib/btb-dashboard";
import { loadBtbOverview } from "../src/lib/btb-dashboard-data";
import { queryClient, jsonRows } from "./helpers/query-client";

const card = (slug: string) => BTB_CARDS.find((item) => item.href === `/between-the-buns/${slug}`)!;
const signal = () => new AbortController().signal;

test("an empty permission table preserves defaults; failed loading blocks operations", () => {
  assert.equal(btbPageAllowed(card("prep-list"), "staff", []), true);
  assert.equal(btbPageAllowed(card("prep-list"), "staff", null), false);
  assert.equal(btbPageAllowed(card("admin"), "admin", null), true);
  assert.deepEqual(accessibleBtbCards("admin", []).map((item) => item.href), ["/between-the-buns/admin"]);
  assert.equal(btbPageAllowed(card("franchise-inspection"), "manager", []), false);
});

test("saved restrictions narrow page access and cannot widen a role", () => {
  const rows: BtbPageAccess[] = [{ role: "staff", page: "prep-list", allowed: false }, { role: "staff", page: "vault", allowed: true }];
  assert.equal(btbPageAllowed(card("prep-list"), "staff", rows), false);
  assert.equal(btbPageAllowed(card("prep-list"), "manager", rows), true);
  assert.equal(btbPageAllowed(card("vault"), "staff", rows), false);
  assert.equal(btbCardForPath("/between-the-buns/prep-manual/chapter?print=1")?.feature, "reference");
  assert.equal(btbCardForPath("/between-the-buns/prep-manual-extra"), undefined);
});

test("bulk permissions reject duplicate, unknown, malformed and privilege-expanding rows", () => {
  const valid = { role: "staff", page: "prep-list", allowed: false };
  assert.deepEqual(validateAccessChanges({ rows: [valid, { role: "manager", page: "vault", allowed: true }] }), [valid, { role: "manager", page: "vault", allowed: true }]);
  for (const invalid of [null, {}, { rows: [] }, { rows: [valid, valid] }, { rows: [valid, { ...valid, role: "admin" }] }, { ...valid, page: "does-not-exist" }, { ...valid, allowed: "false" }, { ...valid, page: "vault", allowed: true }, { ...valid, page: "admin" }]) {
    assert.equal(validateAccessChanges(invalid), null, JSON.stringify(invalid));
  }
});

test("restricted metrics make no database requests for that page", async () => {
  const { client, requests } = queryClient(() => jsonRows([], 0));
  const result = await loadBtbOverview(client, "manager", [{ role: "manager", page: "compliance", allowed: false }], "2026-11-01", signal());
  assert.equal(result.values.renewals, undefined);
  assert.equal(result.values.licensesDue, 0);
  assert.ok(requests.every((request) => !request.url.includes("compliance_documents")));
  for (const request of requests.filter((item) => item.method === "HEAD")) {
    assert.equal(new URL(request.url).searchParams.get("restaurant_name"), "eq.Between the Buns");
  }
});

test("inventory status distinguishes no snapshot from a failed snapshot query", async () => {
  const missing = queryClient(() => jsonRows([]));
  const draft = await loadBtbOverview(missing.client, "manager", [], "2026-01-01", signal());
  assert.equal(draft.inventoryMonth, "2025-12");
  assert.equal(draft.values.inventoryStatus, "Draft");
  const failing = queryClient((request) => request.url.includes("inventory_month_snapshots") ? new Response(JSON.stringify({ message: "unavailable" }), { status: 503 }) : jsonRows([]));
  const result = await loadBtbOverview(failing.client, "manager", [], "2026-01-01", signal());
  assert.equal(result.values.inventoryStatus, null);
  assert.equal(btbDateWindow("2026-02-30"), null);
});

test("administrator overview reads permission summaries without operational database access", async () => {
  const { client, requests } = queryClient();
  const result = await loadBtbOverview(client, "admin", [{ role: "staff", page: "prep-list", allowed: false }], "2026-11-01", signal());
  assert.equal(result.values.roles, 4);
  assert.equal(result.values.restrictions, 1);
  assert.equal(result.values.tools, 1);
  assert.equal(requests.length, 0);
});
