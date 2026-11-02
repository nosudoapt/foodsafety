import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BTB_CARDS } from "../src/lib/btb-hub";
import { btbCanEdit, btbCanView } from "../src/lib/btb-access";
import { BTB_ROLES } from "../src/lib/btb-roles";
import { canonicalCheckItems } from "../src/lib/btb-operations";
import { checkDraftKey, parseCheckDraft, previewChecks } from "../src/lib/btb-check-drafts";

// The Opening/Closing checklist used to be the middle tab of the prep sheet.
// These tests pin the split: it lives at /between-the-buns/checklists behind
// its own gate, has its own hub card, and the prep sheet no longer carries it.

const PAGE = join(process.cwd(), "src/app/between-the-buns/checklists/page.tsx");
const PREP = join(process.cwd(), "src/app/between-the-buns/prep-list/page.tsx");

const pageSource = readFileSync(PAGE, "utf8");
const prepSource = readFileSync(PREP, "utf8");

test("checklists page is gated on its own feature", () => {
  assert.match(pageSource, /<BtbFeatureGate feature="checklists"/);
});

test("opening and closing templates retain every duty and saved attribution", () => {
  for (const type of ["opening", "closing"] as const) {
    const items = canonicalCheckItems(type);
    assert.equal(items.length, 20);
    const saved = [{ ...items[0], text: "outdated label", completed: true, completed_by: "employee-1", completed_by_name: "Taylor" }];
    const loaded = canonicalCheckItems(type, saved);
    assert.equal(loaded.length, 20);
    assert.equal(loaded[0].text, items[0].text);
    assert.equal(loaded[0].completed_by_name, "Taylor");
    assert.equal(loaded[1].completed, false);
  }
});

test("drafts are isolated by employee, day and shift, without attributing old shared ticks", () => {
  const key = checkDraftKey("alice", "2026-11-01", "opening");
  assert.notEqual(key, checkDraftKey("bob", "2026-11-01", "opening"));
  assert.notEqual(key, checkDraftKey("alice", "2026-11-02", "opening"));
  assert.notEqual(key, checkDraftKey("alice", "2026-11-01", "closing"));
  assert.equal(parseCheckDraft('{"o1":true}', "opening"), null);
  const draft = { version: 2, changes: { o1: true }, notes: "Opening handover" };
  assert.deepEqual(parseCheckDraft(JSON.stringify(draft), "opening"), draft);
  assert.equal(parseCheckDraft(JSON.stringify(draft), "closing"), null);
  const preview = previewChecks("opening", [], draft, "Alice");
  assert.equal(preview[0].completed_by, null);
  assert.equal(preview[0].completed_by_name, "Alice · not saved");
});

test("the prep sheet no longer carries the checklist tab", () => {
  assert.ok(!prepSource.includes('setActiveTab("checklist")'), "tab button removed");
  assert.ok(!prepSource.includes("ChecklistCard"), "ChecklistCard moved out");
  assert.ok(!prepSource.includes("btb-checklists"), "import removed");
});

test("the hub has a dedicated Opening & Closing card wired to the feature", () => {
  const cards = BTB_CARDS.filter((c) => c.href === "/between-the-buns/checklists");
  assert.equal(cards.length, 1, "exactly one card for the checklists route");
  assert.equal(cards[0].feature, "checklists");
  assert.equal(cards[0].title, "Opening & Closing");
  // And the prep sheet card no longer pretends to be the checklist's home.
  assert.ok(BTB_CARDS.some((c) => c.href === "/between-the-buns/prep-list"));
});

test("checklists access mirrors the prep sheet for every role", () => {
  for (const r of BTB_ROLES) {
    assert.equal(
      btbCanView("checklists", r),
      btbCanView("prep_list", r),
      `view parity for ${r}`
    );
    assert.equal(
      btbCanEdit("checklists", r),
      btbCanEdit("prep_list", r),
      `edit parity for ${r}`
    );
  }
  assert.ok(btbCanEdit("checklists", "staff"), "staff tick the duties");
  assert.ok(!btbCanEdit("checklists", "corporate"), "corporate reads only");
});
