import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { BTB_RESTAURANT } from "@/lib/btb-team";
import { parseBtbUpload, requireBtbUploader, uploadText } from "@/lib/btb-uploader";
import { BTB_UPLOAD_BODY_BYTES } from "@/lib/btb-uploads";

export const POST = btbRoute("manuals", true, async ({ db }, request) => {
  const body = await readBody(request, BTB_UPLOAD_BODY_BYTES);
  const title = uploadText(body.title, "a title", 200, true);
  const description = uploadText(body.description ?? "", "a description", 2000);
  if (typeof body.category !== "string" || !["general", "safety", "operations", "training", "other"].includes(body.category)) throw new BtbApiError("Choose a manual category.");
  const file = parseBtbUpload(body.file, "manual");
  const result = await db.from("print_manuals").insert({ user_id: await requireBtbUploader(db), restaurant_name: BTB_RESTAURANT,
    title, description, category: body.category, ...file }).select("id,title,description,file_name,file_size,category,created_at").single();
  dbError(result.error, "The manual could not be uploaded. Please retry.");
  return { manual: result.data };
}, { allowLocationWorkspace: true });
