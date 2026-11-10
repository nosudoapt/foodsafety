import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDraft, masterRowsProblem, type MasterRowDraft } from "../src/lib/btb-platform-inventory";

// --- draft normalisation: numbers may arrive as "$1,234.50" strings ----------
test("purchase drafts accept printed currency strings and keep blanks as null", () => {
  const draft = normalizeDraft("gfs", {
    vendor: " GFS Calgary ",
    reference: "  ",
    date: "2026-10-14",
    total: "$1,234.50",
    lines: [{ description: "Ground Beef", item_code: "1505362", cases: "2", packets: null, unit_price: "$89.90", line_total: 179.8 }],
  });
  assert.ok(draft);
  assert.equal(draft.vendor, "GFS Calgary");
  assert.equal(draft.reference, null, "blank reference is null, never invented");
  assert.equal(draft.total, 1234.5);
  const line = (draft.lines as Record<string, unknown>[])[0];
  assert.equal(line.cases, 2);
  assert.equal(line.packets, null, "a blank quantity must not become zero");
  assert.equal(line.unit_price, 89.9);
  assert.equal(line.line_total, 179.8);
});

test("sales drafts keep every labelled figure and drop unlabeled rows", () => {
  const draft = normalizeDraft("sales", {
    figures: [
      { label: "Total Net Sales", value: "12,345.00" },
      { label: "", value: 99 },
      { label: "Gross Sales" },
    ],
  });
  assert.ok(draft);
  assert.deepEqual(draft.figures, [{ label: "Total Net Sales", value: 12345 }]);
});

test("master drafts keep every named row, dropping only nameless noise", () => {
  const draft = normalizeDraft("master", {
    items: [
      { item_number: "1505362", name: "Tortilla Wraps", pack_size: "12", case_price: "$33.80", packet_price: null },
      { name: "   " },
      { name: " LOCAL Boxes ", source: "local", case_price: 0, packet_price: 0, pack_size: 1 },
    ],
  });
  assert.ok(draft);
  const items = draft.items as Record<string, unknown>[];
  assert.equal(items.length, 2, "nameless rows are noise, priced rows are kept");
  assert.equal(items[0].packet_price, null, "missing packet price stays null for the reviewer to fill");
  assert.equal(items[1].name, "LOCAL Boxes");
  assert.equal(items[1].case_price, 0, "an explicit zero is a deliberate zero");
});

test("unusable AI responses fail loudly instead of drafting empty shapes", () => {
  for (const kind of ExtractKindAll) {
    assert.equal(normalizeDraft(kind, null), null);
    assert.equal(normalizeDraft(kind, "not an object"), null);
    assert.equal(normalizeDraft(kind, {}), null, `${kind}: no rows -> no draft`);
    assert.equal(normalizeDraft(kind, []), null, "a bare array is not a draft");
  }
});

const ExtractKindAll = ["gfs", "local", "sales", "master"] as const;

// --- the reviewed master rows: blank is never silently zero ------------------
const row = (over: Partial<MasterRowDraft>): MasterRowDraft => ({
  item_number: "1330551", name: "Oat Drink", source: "gfs", unit_size: "1 L",
  pack_size: "12", category: "", case_price: "20.97", packet_price: "1.75", par_value: "",
  ...over,
});

test("complete master rows validate clean, including a deliberate zero price", () => {
  assert.equal(masterRowsProblem([row({})]), null);
  assert.equal(masterRowsProblem([row({ case_price: "0", packet_price: "0", name: "LOCAL Boxes" })]), null,
    "unpriced LOCAL packaging is an honest explicit zero");
});

test("master rows refuse blanks, negatives, and bad pack sizes", () => {
  assert.match(masterRowsProblem([row({ item_number: "  " })]) ?? "", /item number/);
  assert.match(masterRowsProblem([row({ name: "" })]) ?? "", /description/);
  assert.match(masterRowsProblem([row({ pack_size: "" })]) ?? "", /pack size/);
  assert.match(masterRowsProblem([row({ pack_size: "0" })]) ?? "", /pack size/);
  assert.match(masterRowsProblem([row({ case_price: "" })]) ?? "", /both prices/);
  assert.match(masterRowsProblem([row({ packet_price: "" })]) ?? "", /both prices/);
  assert.match(masterRowsProblem([row({ case_price: "-1" })]) ?? "", /negative/);
  assert.match(masterRowsProblem([row({ packet_price: "-0.5" })]) ?? "", /negative/);
  assert.match(masterRowsProblem([]) ?? "", /no rows/);
});
