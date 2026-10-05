import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Patch 12 — Print / Save PDF on the four reference pages. Each one ships a
// PrintButton plus a #print-section that globals.css isolates at print time,
// and the manuals page appends the stored PDFs as iframes.

const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const css = read("src/app/globals.css");
const button = read("src/components/PrintButton.tsx");
const prepManual = read("src/app/between-the-buns/prep-manual/page.tsx");
const recipeCharts = read("src/app/between-the-buns/menu/page.tsx");
const allergyChart = read("src/app/between-the-buns/allergen-chart/page.tsx");
const procedureManuals = read("src/components/PrintManuals.tsx");

const PAGES: [string, string][] = [
  ["Prep Manual", prepManual],
  ["Recipe Charts", recipeCharts],
  ["Bun Allergy Chart", allergyChart],
  ["Procedure Manual", procedureManuals],
];

test("all four pages ship a Print / Save PDF button", () => {
  assert.ok(button.includes("window.print()"), "PrintButton opens the print dialog");
  for (const [name, source] of PAGES) {
    assert.ok(source.includes('PrintButton from "@/components/PrintButton"'), `${name} must import PrintButton`);
    assert.ok(source.includes("<PrintButton"), `${name} must render PrintButton`);
  }
});

test("all four pages provide a #print-section", () => {
  for (const [name, source] of PAGES) {
    assert.ok(source.includes('id="print-section"'), `${name} needs a #print-section`);
  }
});

test("@media print isolates the print section", () => {
  assert.ok(css.includes("#print-section"), "the print rules must target #print-section");
  assert.ok(/visibility:\s*hidden/.test(css), "everything outside the section is hidden");
  assert.ok(css.includes("#print-section *"), "the section's children stay visible");
  assert.ok(
    css.includes("position: absolute") && css.includes("width: 100%"),
    "the section is pinned to the top of the sheet"
  );
});

test("pages without a print section keep printing normally", () => {
  // /reports and /admin/print-materials print the whole page. The :has() guard
  // scopes the visibility rules so they don't turn those printouts blank.
  assert.ok(
    css.includes("body:has(#print-section)"),
    "the rule must be scoped to pages that actually ship a #print-section"
  );
});

test("the manuals page embeds the stored PDFs as iframes", () => {
  assert.ok(procedureManuals.includes("<iframe"), "PDF manuals render in iframes");
  assert.ok(procedureManuals.includes("onLoad={onPrintFrameLoad}"), "print waits for the frames");
  assert.ok(procedureManuals.includes("window.print()"), "the dialog opens once loaded");
});
