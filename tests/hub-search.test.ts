import { test } from "node:test";
import assert from "node:assert/strict";
import { searchBtbCards } from "../src/lib/btb-dashboard";
import { accessibleBtbCards } from "../src/lib/btb-page-access";

test("search matches titles, descriptions and work groups case-insensitively", () => {
  assert.ok(searchBtbCards("manager", [], "  MONTH-END  ").some((card) => card.feature === "month_end_inventory"));
  assert.ok(searchBtbCards("staff", [], "recipes").some((card) => card.href.endsWith("/prep-manual")));
  assert.ok(searchBtbCards("staff", [], "shift stock").some((card) => card.feature === "prep_list"));
});

test("search never reveals pages excluded by a role or saved restrictions", () => {
  assert.deepEqual(searchBtbCards("staff", [], "vault"), []);
  assert.deepEqual(searchBtbCards("manager", [{ role: "manager", page: "vault", allowed: false }], "vault"), []);
  assert.deepEqual(searchBtbCards("manager", null, ""), []);
});

test("clearing a no-match query restores the full permitted directory", () => {
  assert.deepEqual(searchBtbCards("staff", [], "nonexistent page 928"), []);
  // Search covers hub tiles only: sections of a combined card (Business
  // Documents, staff certificates, tax dates, reminders) are reachable but are
  // not separate tiles, so they never surface as search results either.
  assert.deepEqual(searchBtbCards("staff", [], " "), accessibleBtbCards("staff", []).filter((card) => card.hub !== false));
  assert.ok(!searchBtbCards("manager", [], "tax").some((card) => card.feature === "tax_dates"), "tax dates live inside the Compliance card, not as their own tile");
});
