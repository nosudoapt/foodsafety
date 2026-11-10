import "server-only";

/**
 * Extract a PDF's embedded text layer on the server, offline and free, so the
 * AI model receives real text instead of a raster guess wherever the source
 * document carries one (most supplier invoices and POS exports do).
 * Scanned images (no usable layer) return "" and the caller falls back to the
 * vision model.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    const limit = Math.min(doc.numPages, 12);
    for (let n = 1; n <= limit; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push(text);
    }
    return pages.join("\n").trim();
  } catch {
    return "";
  }
}
