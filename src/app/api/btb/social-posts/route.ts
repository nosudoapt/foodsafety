import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { BTB_RESTAURANT, isIsoDate, isUuid } from "@/lib/btb-team";
import { btbUploadCreator, requireBtbUploader, uploadText } from "@/lib/btb-uploader";

export const POST = btbRoute("marketing", true, async ({ db, identity }, request) => {
  const body = await readBody(request);
  const caption = uploadText(body.caption, "a caption", 2000, true);
  if (!Number.isInteger(body.day) || Number(body.day) < 0 || Number(body.day) > 6 || !["Instagram", "Facebook", "In-store", "TikTok"].includes(String(body.channel))) throw new BtbApiError("Choose a weekday and channel.");
  if (body.post_date != null && !isIsoDate(body.post_date)) throw new BtbApiError("Choose a valid publishing date.");
  const day = body.post_date ? (new Date(`${body.post_date}T12:00:00Z`).getUTCDay() + 6) % 7 : body.day;
  const profile = await requireBtbUploader(db);
  const result = await db.from("social_media_calendar").insert({
    user_id: profile, restaurant_name: BTB_RESTAURANT, caption, day,
    channel: body.channel, post_date: body.post_date ?? null, ...btbUploadCreator(identity),
  }).select("id,day,channel,caption,post_date,btb_created_by_name").single();
  dbError(result.error, "The post wasn’t saved. Your caption and schedule are still here; please try again.");
  if (!result.data) throw new BtbApiError("The save could not be confirmed. Reload the planner before retrying.", 503);
  return { post: result.data };
});

export const DELETE = btbRoute("marketing", true, async ({ db }, request) => {
  const body = await readBody(request);
  if (!isUuid(body.id)) throw new BtbApiError("Choose a saved post.");
  const result = await db.from("social_media_calendar").delete().eq("restaurant_name", BTB_RESTAURANT).eq("id", body.id).select("id").maybeSingle();
  dbError(result.error, "The post wasn’t removed. Please try again.");
  if (!result.data) throw new BtbApiError("This post is no longer available. Reload the planner.", 404);
  return { ok: true };
});
