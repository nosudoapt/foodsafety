import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readGfsInvoice } from "../.test-dist/src/lib/btb-gfs-reader.js";

const referenceInvoice = new URL("../reference-documents/GFS-Invoice-9041952706.pdf", import.meta.url);

test("the real multi-page GFS invoice yields all 13 printed lines, $863.12, and no fabricated date or GST", {
  skip: existsSync(referenceInvoice) ? false : "Private reference invoice is not included in the source repository.",
}, async () => {
  const bytes = new Uint8Array(await readFile(referenceInvoice));
  const loading = getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true });
  try {
    const doc = await loading.promise;
    assert.equal(doc.numPages, 2);
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" "));
    const invoice = readGfsInvoice(pages.join("\n")); assert.ok(invoice);
    assert.equal(invoice.reference, "9041952706"); assert.equal(invoice.total, 863.12); assert.equal(invoice.lines.length, 13);
    assert.equal(invoice.date, null); assert.equal(invoice.gst, null); assert.equal(invoice.subtotal, null); assert.equal(invoice.other_tax, null); assert.equal(invoice.charges, null);
    assert.equal(invoice.lines.reduce((sum, line) => sum + Math.round(line.line_total * 100), 0), 83133, "The unlabelled $31.79 difference is not assumed GST");
    assert.deepEqual(invoice.lines.find((line) => line.item_code === "1317050"), { item_code: "1317050", description: "FRIES S/C CLEAR COAT 3/8IN", cases: 2, packets: 0, unit_price: 38.56, line_total: 77.12, price_basis: "case" });
    assert.equal(invoice.lines.at(-1).item_code, "7484405");
    assert.equal(readGfsInvoice(pages[0]), null, "A truncated first page must never be accepted as the complete source");
  } finally { await loading.destroy(); }
});
