import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { IMPORT_KINDS, type ImportKind } from "@/lib/btb-platform";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/**
 * Stage a reviewed extraction. The route never invents line values: the caller
 * must send the text (and optionally the OCR/PDF text layer) that was actually
 * read, a named extractor, and an extraction error when extraction failed so the
 * document lands in the review queue instead of the ledger.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 64_000);
  const location = body.location_id;
  const file = body.file_id;
  const kind = body.kind;
  const month = body.month;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (!isUuid(file)) throw new BtbApiError("Upload the source document first.");
  if (!IMPORT_KINDS.includes(kind as ImportKind)) throw new BtbApiError("Choose which document this is.");
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BtbApiError("Choose the accounting month.");
  const text = typeof body.text === "string" ? body.text.slice(0, 200_000) : "";
  const extracted = body.extracted && typeof body.extracted === "object" && !Array.isArray(body.extracted) ? body.extracted : {};
  const extractor = typeof body.extractor === "string" && body.extractor.trim() ? body.extractor.trim().slice(0, 100) : "manual-entry";
  const failure = typeof body.error === "string" ? body.error.trim().slice(0, 1_000) : null;
  if (!text && !failure) throw new BtbApiError("Enter the document text or record why extraction failed so a person can review it.");
  const result = await platformRpc(db, "btb_platform_import", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_file: file,
    p_kind: kind,
    p_month: month,
    p_text: text,
    p_extracted: extracted,
    p_extractor: extractor,
    p_error: failure,
  }, "This document could not be staged for review.");
  return { import: result };
});
