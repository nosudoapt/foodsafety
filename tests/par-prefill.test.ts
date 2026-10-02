import { test } from "node:test";
import assert from "node:assert/strict";
import { buildParMaps, parFor } from "../src/lib/par-prefill";

// 2026-10-02 is a Friday; 2026-09-25 is the previous Friday.
const TODAY = "2026-10-02";
const LAST_FRI = "2026-09-25";
const A_WED = "2026-09-30";

test("prefers the most recent same-weekday entry over a newer mid-week one", () => {
  const maps = buildParMaps(
    [
      { item_name: "Beef patties", date: A_WED, par: 12, urgent: false },
      { item_name: "Beef patties", date: LAST_FRI, par: 40, urgent: true },
      { item_name: "Buns", date: A_WED, par: 60, urgent: false },
    ],
    TODAY,
  );
  const beef = parFor(maps, "Beef patties");
  assert.deepEqual(beef, { par: 40, urgent: true });
  // No same-weekday row — falls back to the most recent entry.
  assert.deepEqual(parFor(maps, "Buns"), { par: 60, urgent: false });
});

test("first row per item wins when dates tie (rows arrive newest-first)", () => {
  const maps = buildParMaps(
    [
      { item_name: "Fries", date: TODAY, par: 30 },
      { item_name: "Fries", date: TODAY, par: 25 },
    ],
    TODAY,
  );
  assert.equal(parFor(maps, "Fries")?.par, 30);
});

test("unknown items and junk numbers are safe", () => {
  const maps = buildParMaps([], TODAY);
  assert.equal(parFor(maps, "Nope"), undefined);
  const maps2 = buildParMaps([{ item_name: "X", date: LAST_FRI, par: Number("bad") }], TODAY);
  assert.deepEqual(parFor(maps2, "X"), { par: 0, urgent: false });
});

test("urgent is coerced to a boolean when absent", () => {
  const maps = buildParMaps([{ item_name: "X", date: LAST_FRI, par: 5, urgent: null }], TODAY);
  assert.equal(parFor(maps, "X")?.urgent, false);
});
