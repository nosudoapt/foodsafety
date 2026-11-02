import { randomUUID } from "node:crypto";
import { btbRoute, BtbApiError, dbError } from "@/lib/btb-api";

export const POST = btbRoute("training_guide", true, async ({ db }, request) => {
  if (Number(request.headers.get("content-length")) > 101 * 1024 * 1024) throw new BtbApiError("Choose a video under 100 MB.", 413);
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || !file.type.startsWith("video/") || file.size > 100 * 1024 * 1024 || !file.size) throw new BtbApiError("Choose a video under 100 MB.");
  const path = `btb/${randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120)}`;
  const result = await db.storage.from("training-videos").upload(path, file, { contentType: file.type, upsert: false });
  dbError(result.error, "The video could not be uploaded. Keep your module draft and try again.");
  return { url: db.storage.from("training-videos").getPublicUrl(path).data.publicUrl };
});
