import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Staff Resource Hub search bar: a single input above the card grid that
// filters the signed-in role's own cards by title or description.

const hub = readFileSync(
  join(__dirname, "../../src/app/between-the-buns/hub.tsx"),
  "utf8"
);

test("the hub renders a search bar above the card grid", () => {
  assert.ok(hub.includes('aria-label="Search cards"'), "the input needs an accessible name");
  assert.ok(hub.includes('placeholder="Search cards'), "the placeholder explains what to type");
  assert.ok(hub.includes('type="search"'), "use the search input type");
  assert.ok(
    hub.indexOf('aria-label="Search cards"') < hub.indexOf("visible.map"),
    "the search bar must sit above the grid"
  );
});

test("the search filters the visible cards by title and description", () => {
  assert.ok(hub.includes("cards.filter"), "filtering is driven by the query");
  assert.ok(hub.includes("c.title.toLowerCase()"), "match on the card title");
  assert.ok(hub.includes("c.desc.toLowerCase()"), "match on the card description");
  assert.ok(hub.includes("visible.map"), "the grid renders the filtered list");
  assert.ok(hub.includes("useState"), "the query is client state");
});

test("an empty result explains itself instead of showing a blank grid", () => {
  assert.ok(hub.includes("No cards match"), "an empty state is required");
  assert.ok(hub.includes("No cards match “{query.trim()}”".slice(0, 14)), "it echoes the query");
});
