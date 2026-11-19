import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { IMPORT_KINDS, type ImportKind } from "@/lib/btb-platform";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";
import { runAiExtract } from "@/lib/btb-ai-extract";
import { readGfsInvoice } from "@/lib/btb-gfs-reader";

/**
 * AI-assisted extraction over an already-uploaded private document. Produces a
 * DRAFT only: the browser still posts to /api/btb/platform/import (with these
 * values as p_extracted) and a person confirms through the existing review
 * flow. Supported GFS text layouts need no API key; other layouts use AI when
 * configured and always retain the manual review fallback.
 *
 * btb_ai_extract_prepare is the gate and the meter in one: it asserts the
 * document-kind capability, enforces the location's daily cap, and only then
 * hands the stored key to this server route for the provider call. The key
 * never reaches the browser and the settings RPCs never return it.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 16_000);
  const location = body.location_id;
  const file = body.file_id;
  const kind = body.kind as ImportKind;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (!isUuid(file)) throw new BtbApiError("Upload the source document first.");
  if (!IMPORT_KINDS.includes(kind)) throw new BtbApiError("Choose which document this is.");
  const hint = typeof body.hint === "string" ? body.hint.trim().slice(0, 300) : "";

  // The file must exist, belong to this location, and be readable by this actor
  // (the SQL function re-checks purpose and membership).
  const fileRecord = await platformRpc<{ location_id: string; purpose: string; name: string; mime: string; content_base64: string; sha256: string }>(
    db, "btb_platform_file_get", { p_actor: employeeId, p_session: sessionVersion, p_file: file },
    "The uploaded document could not be opened.",
  );
  if (!fileRecord?.content_base64) throw new BtbApiError("The uploaded document could not be opened.");
  if (fileRecord.location_id !== location || fileRecord.purpose !== (kind === "sales" ? "sales" : "purchase")) throw new BtbApiError("Choose a source document from this location and document category.", 403);

  // PDFs: read the text layer locally (free, offline); images go to the vision model.
  let pdfText: string | undefined;
  const mime = fileRecord.mime || "application/pdf";
  if (mime.includes("pdf")) {
    const bytes = Buffer.from(fileRecord.content_base64, "base64");
    const { extractPdfText } = await import("@/lib/btb-pdf-text");
    const extracted = await extractPdfText(new Uint8Array(bytes));
    pdfText = extracted.length > 40 ? extracted : undefined;
  }
  if (kind === "gfs" && pdfText) {
    const draft = readGfsInvoice(pdfText);
    if (draft) return { extracted: draft, text: pdfText, extractor: "gfs-text-reader", source: { file_id: file, name: fileRecord.name, sha256: fileRecord.sha256, mime },
      note: "Offline GFS draft. Missing dates and taxes stay blank. Verify every line before confirming stock or invoices." };
  }
  const capability = kind === "gfs" || kind === "local" ? "purchase.upload" : "inventory.write";
  const cost = kind === "master" ? 10 : kind === "sales" ? 2 : 1;
  const prepared = await platformRpc<{ model: string | null; api_key: string; used: number; daily_limit: number }>(
    db, "btb_ai_extract_prepare",
    { p_actor: employeeId, p_session: sessionVersion, p_location: location, p_capability: capability, p_cost: cost },
    "This document layout needs AI extraction or manual entry. Configure the AI reader or enter its reviewed values by hand.",
  );

  const outcome = await runAiExtract(
    { api_key: prepared.api_key, model: prepared.model ?? "" },
    { kind, mime, bytes: Buffer.from(fileRecord.content_base64, "base64"), pdfText, hint: hint || undefined },
  );
  if (!outcome.ok || !outcome.extracted) {
    throw new BtbApiError(outcome.error ?? "The AI extraction did not produce usable values. Enter them by hand.", 502);
  }
  return {
    extracted: outcome.extracted,
    extractor: "ai",
    usage: { used: prepared.used, daily_limit: prepared.daily_limit },
    source: { file_id: file, name: fileRecord.name, sha256: fileRecord.sha256, mime },
    note: "Draft values from AI extraction. Check every figure against the document, then confirm through the review queue — the AI never writes the ledger.",
  };
});
