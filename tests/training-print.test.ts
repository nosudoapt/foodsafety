import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Published training prints from API-loaded content; browser PDF tests cover
// pagination and complete text, including modules that are not selected.

const ROOT = join(__dirname, "../..");
const source = readFileSync(join(ROOT, "src/app/between-the-buns/training-guide/page.tsx"), "utf8");
const button = readFileSync(join(ROOT, "src/components/PrintButton.tsx"), "utf8");
const styles = readFileSync(join(ROOT, "src/app/btb-operations.css"), "utf8");

test("the guide ships a Print / Save PDF button", () => {
  assert.ok(source.includes('import PrintButton from "@/components/PrintButton"'));
  assert.ok(source.includes("<PrintButton"), "the header must render PrintButton");
  assert.ok(button.includes("window.print()"), "PrintButton must open the browser print dialog");
});

test("interactive chrome is hidden from printouts", () => {
  assert.ok(
    styles.includes(".training-screen { display: none !important; }"),
    "interactive training screens are hidden in print media",
  );
});

test("#print-section holds the whole guide, not just the open topic", () => {
  const start = source.indexOf('id="print-section"');
  assert.ok(start > -1, "a #print-section is required by the print pattern");
  const section = source.slice(start);
  assert.ok(styles.includes(".training-print { display: none; }"), "print section must be screen-hidden");
  assert.ok(section.includes("data.topics.filter((item) => item.published)"), "print includes the complete published guide");
  assert.ok(section.includes("data.sections.filter"), "print includes sections for each module");
  assert.ok(section.includes("TrainingBody"), "section bodies render paragraphs + checklists");
  assert.ok(section.includes("categoryLabel"), "print groups topics by category");
});

test("training uses the verified API instead of browser table access", () => {
  assert.ok(source.includes('useBtbData<TrainingData>("/api/btb/training")'));
  assert.ok(!source.includes("supabase.from("));
});
