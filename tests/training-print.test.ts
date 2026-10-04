import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 5 — the Training Guide prints: a PrintButton in the header, the
// interactive UI marked print:hidden, and a hidden #print-section that holds
// the whole guide (search results respected) so "Save as PDF" gets real content.

const ROOT = join(__dirname, "../..");
const source = readFileSync(join(ROOT, "src/app/between-the-buns/training-guide/page.tsx"), "utf8");
const button = readFileSync(join(ROOT, "src/components/PrintButton.tsx"), "utf8");

test("the guide ships a Print / Save PDF button", () => {
  assert.ok(source.includes('import PrintButton from "@/components/PrintButton"'));
  assert.ok(source.includes("<PrintButton"), "the header must render PrintButton");
  assert.ok(button.includes("window.print()"), "PrintButton must open the browser print dialog");
});

test("interactive chrome is hidden from printouts", () => {
  assert.ok(
    /<div className="print:hidden">/.test(source),
    "the search/list/detail UI must be wrapped in print:hidden",
  );
});

test("#print-section holds the whole guide, not just the open topic", () => {
  const start = source.indexOf('id="print-section"');
  assert.ok(start > -1, "a #print-section is required by the print pattern");
  const section = source.slice(start);
  assert.ok(section.includes("hidden print:block"), "print section must be screen-hidden");
  assert.ok(section.includes("visibleTopics"), "print must cover every topic that matches the search");
  assert.ok(section.includes("allSections"), "print must include all sections, not only the selected one");
  assert.ok(section.includes("parseBody"), "section bodies must render paragraphs + checklists");
  assert.ok(section.includes("categoryLabel"), "print groups topics by category");
});

test("the section-wide flat load feeds both search and print", () => {
  assert.ok(
    source.includes('from("training_sections").select(SECTION_COLS).limit(1000)'),
    "loadTopics must fetch full section rows once for search + print",
  );
  assert.ok(source.includes("setAllSections(flat)"));
});
