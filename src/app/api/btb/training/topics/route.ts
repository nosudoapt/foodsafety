import { randomUUID } from "node:crypto";
import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { attributionName, isUuid, isVersion } from "@/lib/btb-team";
import { isTrainingCategory } from "@/lib/training";

export const POST = btbRoute("training_guide", true, async ({ db, identity }, request) => {
  const body = await readBody(request);
  if (body.id != null && !isUuid(body.id) || !isVersion(body.revision) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 200 || !isTrainingCategory(body.category) || !Number.isInteger(body.est_minutes) || Number(body.est_minutes) < 1 || Number(body.est_minutes) > 480 || typeof body.published !== "boolean" || typeof body.video_url !== "string") throw new BtbApiError("Enter a title, category and reading time between 1 and 480 minutes.");
  if (body.video_url && !/^https:\/\//i.test(body.video_url)) throw new BtbApiError("Use an HTTPS YouTube or video link.");
  if (body.video_url.length > 2000 || !Array.isArray(body.sections) || body.sections.length > 100) throw new BtbApiError("Keep the video link under 2,000 characters and the module under 100 sections.");
  const ids = new Set<string>();
  const sections = body.sections.map((section, position) => {
    if (!section || typeof section.heading !== "string" || !section.heading.trim() || section.heading.length > 200 || typeof section.body !== "string" || section.body.length > 20000 || (section.id && !isUuid(section.id))) throw new BtbApiError("Each section needs a heading and body (up to 20,000 characters).");
    const id = section.id || randomUUID();
    if (ids.has(id)) throw new BtbApiError("A section was repeated. Reload the module and try again.");
    ids.add(id);
    return { id, heading: section.heading.trim(), body: section.body.trim(), position };
  });
  if (body.published && !sections.length && !body.video_url) throw new BtbApiError("Add a section or video before publishing this module.");
  const result = await db.rpc("btb_save_training_topic", { p_id: body.id ?? null, p_revision: body.revision, p_title: body.title.trim(), p_category: body.category, p_minutes: body.est_minutes, p_published: body.published, p_video: body.video_url.trim(), p_sections: sections, p_actor: attributionName(identity) });
  dbError(result.error, "The module could not be saved. Your draft is still here.");
  if (!result.data?.[0]) throw new BtbApiError("The module save was not confirmed.", 503);
  return { topic: result.data[0], sections: sections.map((section) => ({ ...section, topic_id: result.data[0].id })) };
});
