import { btbRoute, BtbApiError, dbError, readAll, readBody } from "@/lib/btb-api";
import { BTB_RESTAURANT, isUuid } from "@/lib/btb-team";
import { BTB_UPLOAD_BODY_BYTES } from "@/lib/btb-uploads";
import { btbUploadCreator, btbUploaderConnection, parseBtbUpload, requireBtbUploader, uploadText } from "@/lib/btb-uploader";

const COLUMNS = "id,title,description,file_name,file_size,month,year,status,category,size,person_name,location_id,created_at,btb_created_by_name";
const POST_COLUMNS = "id,day,channel,caption,post_date,btb_created_by_name";
const CATEGORIES = ["poster", "flyer", "social", "story", "menu_board", "signage"];
const STATUSES = ["planned", "active", "completed"];

export const GET = btbRoute("marketing", false, async ({ db }, request) => {
  const download = new URL(request.url).searchParams.get("download");
  if (download) {
    if (!isUuid(download)) throw new BtbApiError("Choose a saved promotion.");
    const result = await db.from("marketing_promotions").select("file_url,file_name").eq("restaurant_name", BTB_RESTAURANT).eq("id", download).maybeSingle();
    dbError(result.error, "The artwork couldn’t be downloaded. Please try again.");
    if (!result.data?.file_url) throw new BtbApiError("No artwork is attached to this promotion.", 404);
    return { url: result.data.file_url, name: result.data.file_name };
  }
  const [promotions, posts, uploader] = await Promise.all([
    readAll((from, to) => db.from("marketing_promotions").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT).order("created_at", { ascending: false }).order("id").range(from, to), "Promotions couldn’t be loaded. Please try again."),
    readAll((from, to) => db.from("social_media_calendar").select(POST_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).order("day").order("id").range(from, to), "The social planner couldn’t be loaded. Please try again."),
    btbUploaderConnection(db),
  ]);
  return { promotions, posts, uploader };
});

export const POST = btbRoute("marketing", true, async ({ db, identity }, request) => {
  const body = await readBody(request, BTB_UPLOAD_BODY_BYTES);
  const title = uploadText(body.title, "a campaign title", 200, true);
  const description = uploadText(body.description ?? "", "a description", 2000);
  if (!Number.isInteger(body.month) || Number(body.month) < 1 || Number(body.month) > 12 || !Number.isInteger(body.year) || Number(body.year) < 2000 || Number(body.year) > 2100) throw new BtbApiError("Choose a valid campaign month and year.");
  if (!CATEGORIES.includes(String(body.category))) throw new BtbApiError("Choose a campaign category.");
  const size = uploadText(body.size, "an artwork size", 100, true);
  const person = uploadText(body.person_name ?? "", "a person’s name", 100);
  if (body.location_id != null && body.location_id !== "") throw new BtbApiError("BTB campaigns are company-wide. Choose All locations.");
  const file = body.file == null ? { file_name: null, file_url: null, file_size: null } : parseBtbUpload(body.file, "artwork");
  const profile = await requireBtbUploader(db);
  const result = await db.from("marketing_promotions").insert({
    user_id: profile, restaurant_name: BTB_RESTAURANT, title, description,
    month: body.month, year: body.year, status: "planned", category: body.category,
    size, person_name: person || null, location_id: null, ...file, ...btbUploadCreator(identity),
  }).select(COLUMNS).single();
  dbError(result.error, "The promotion wasn’t saved. Your details and artwork are still here; please try again.");
  if (!result.data) throw new BtbApiError("The save could not be confirmed. Reload the board before retrying.", 503);
  return { promotion: result.data };
});

export const PATCH = btbRoute("marketing", true, async ({ db }, request) => {
  const body = await readBody(request);
  if (!isUuid(body.id) || !STATUSES.includes(String(body.status)) || !STATUSES.includes(String(body.previous_status))) throw new BtbApiError("Choose a saved campaign and status.");
  const result = await db.from("marketing_promotions").update({ status: body.status, updated_at: new Date().toISOString() }).eq("restaurant_name", BTB_RESTAURANT).eq("id", body.id).eq("status", body.previous_status).select("id").maybeSingle();
  dbError(result.error, "The promotion status wasn’t changed. Please try again.");
  if (!result.data) throw new BtbApiError("This campaign changed on another device. Reload the board before updating it.", 409);
  return { ok: true };
});

export const DELETE = btbRoute("marketing", true, async ({ db }, request) => {
  const body = await readBody(request);
  if (!isUuid(body.id)) throw new BtbApiError("Choose a saved campaign.");
  const result = await db.from("marketing_promotions").delete().eq("restaurant_name", BTB_RESTAURANT).eq("id", body.id).select("id").maybeSingle();
  dbError(result.error, "The promotion wasn’t deleted. Please try again.");
  if (!result.data) throw new BtbApiError("This campaign is no longer available. Reload the board.", 404);
  return { ok: true };
});
