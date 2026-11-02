import { btbRoute, BtbApiError, dbError, readAll, readBody } from "@/lib/btb-api";
import { btbCanEdit } from "@/lib/btb-access";
import { BTB_RESTAURANT, isUuid } from "@/lib/btb-team";
import { BTB_UPLOAD_BODY_BYTES } from "@/lib/btb-uploads";
import { btbUploadCreator, btbUploaderConnection, parseBtbUpload, requireBtbUploader, uploadText } from "@/lib/btb-uploader";

const COLUMNS = "id,doc_type,name,file_name,file_size,expiry_date,notes,created_at,btb_created_by_name";

export const GET = btbRoute("documents", false, async ({ db, identity }, request) => {
  const download = new URL(request.url).searchParams.get("download");
  if (download) {
    if (!isUuid(download)) throw new BtbApiError("Choose a saved document.");
    const result = await db.from("business_documents").select("file_url,file_name").eq("restaurant_name", BTB_RESTAURANT).is("expiry_date", null).eq("id", download).maybeSingle();
    dbError(result.error, "This file couldn’t be downloaded. Please try again.");
    if (!result.data?.file_url) throw new BtbApiError("This document is no longer available.", 404);
    return { url: result.data.file_url, name: result.data.file_name };
  }
  const [documents, uploader] = await Promise.all([
    readAll((from, to) => db.from("business_documents").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT).is("expiry_date", null).order("created_at", { ascending: false }).order("id").range(from, to), "The document register couldn’t be loaded. Please try again."),
    btbCanEdit("documents", identity.role) ? btbUploaderConnection(db) : null,
  ]);
  return { documents, uploader };
});

export const POST = btbRoute("documents", true, async ({ db, identity }, request) => {
  const body = await readBody(request, BTB_UPLOAD_BODY_BYTES);
  const name = uploadText(body.name, "a document name", 200, true);
  const notes = uploadText(body.notes ?? "", "notes", 1000);
  const file = parseBtbUpload(body.file, "document");
  const profile = await requireBtbUploader(db);
  const result = await db.from("business_documents").insert({
    user_id: profile, uploaded_by: profile, restaurant_name: BTB_RESTAURANT,
    doc_type: "other", expiry_date: null, name, notes, ...file, ...btbUploadCreator(identity),
  }).select(COLUMNS).single();
  dbError(result.error, "The document wasn’t uploaded. Your file and details are still here; please try again.");
  if (!result.data) throw new BtbApiError("The upload could not be confirmed. Reload the register before retrying.", 503);
  return { document: result.data };
});

export const DELETE = btbRoute("documents", true, async ({ db }, request) => {
  const body = await readBody(request);
  if (!isUuid(body.id)) throw new BtbApiError("Choose a saved document.");
  const result = await db.from("business_documents").delete().eq("restaurant_name", BTB_RESTAURANT).is("expiry_date", null).eq("id", body.id).select("id").maybeSingle();
  dbError(result.error, "The document wasn’t deleted. It’s still in your register; please try again.");
  if (!result.data) throw new BtbApiError("This document is no longer available. Reload the register.", 404);
  return { ok: true };
});
