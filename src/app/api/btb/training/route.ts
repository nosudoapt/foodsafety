import { btbRoute, BtbApiError, dbError, readAll, readBody, TEAM_COLUMNS } from "@/lib/btb-api";
import { BTB_RESTAURANT, isUuid, isVersion, type TeamMember } from "@/lib/btb-team";
import { validTrainingSelection, type BtbTrainingTopic, type TrainingRecord, type TrainingReview } from "@/lib/btb-training";
import type { TrainingSection } from "@/lib/training";

const TOPIC_COLUMNS = "id,title,category,est_minutes,published,position,video_url,revision";
const RECORD_COLUMNS = "id,employee_id,topic_id,topic_revision,completed_sections,reviewed,status,notes,submitted_at,reviewed_at,reviewed_by_name,review_notes,version,updated_at";
export const GET = btbRoute("training_guide", false, async ({ db, identity }, request) => {
  const summary = new URL(request.url).searchParams.get("summary") === "1";
  const teamView = ["manager", "supervisor", "corporate"].includes(identity.role);
  const topics = await readAll<BtbTrainingTopic>((from, to) => {
    let query = db.from("training_topics").select(TOPIC_COLUMNS).is("location_id", null);
    if (identity.role !== "manager") query = query.eq("published", true);
    return query.order("position").order("id").range(from, to);
  }, "Training modules could not be loaded.");
  const ids = topics.map((topic) => topic.id);
  const [sections, records, employees, reviews] = await Promise.all([
    ids.length && !summary ? readAll<TrainingSection>((from, to) => db.from("training_sections").select("id,topic_id,position,heading,body").in("topic_id", ids).order("position").order("id").range(from, to), "Training sections could not be loaded.") : [],
    !teamView && !identity.employeeId ? [] : readAll<TrainingRecord>((from, to) => {
      let query = db.from("btb_training_records").select(RECORD_COLUMNS);
      if (!teamView) query = query.eq("employee_id", identity.employeeId!);
      return query.order("updated_at", { ascending: false }).order("id").range(from, to);
    }, "Training progress could not be loaded."),
    teamView ? readAll<TeamMember>((from, to) => db.from("btb_employees").select(TEAM_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).order("name").order("id").range(from, to), "The training team list could not be loaded.") : [],
    summary || !teamView && !identity.employeeId ? [] : readAll<TrainingReview>((from, to) => {
      let query = db.from("btb_training_reviews").select("id,record_id,employee_id,topic_id,decision,reviewer_name,notes,created_at");
      if (!teamView) query = query.eq("employee_id", identity.employeeId!);
      return query.order("created_at", { ascending: false }).order("id").range(from, to);
    }, "Training review history could not be loaded."),
  ]);
  return { topics, sections, records, employees, reviews };
});

export const POST = btbRoute("training_guide", false, async ({ db, identity }, request) => {
  if (!identity.employeeId) throw new BtbApiError("Sign in with your individual employee account to submit training.", 403);
  const body = await readBody(request);
  if (!isUuid(body.topic_id) || !isVersion(body.version) || !isVersion(body.topic_revision) || !["in_progress", "pending"].includes(String(body.status)) || typeof body.reviewed !== "boolean" || typeof body.notes !== "string" || body.notes.length > 2000) throw new BtbApiError("Review your training form and try again.");
  const topic = await db.from("training_topics").select(TOPIC_COLUMNS).eq("id", body.topic_id).is("location_id", null).eq("published", true).maybeSingle();
  dbError(topic.error, "This module could not be verified.");
  if (!topic.data) throw new BtbApiError("This module is no longer published.", 404);
  const sections = await readAll<TrainingSection>((from, to) => db.from("training_sections").select("id,topic_id,position,heading,body").eq("topic_id", body.topic_id).order("id").range(from, to), "The module’s sections could not be verified.");
  if (!validTrainingSelection(body.completed_sections, sections)) throw new BtbApiError("The module changed. Reload its sections before submitting.", 409);
  if (body.status === "pending" && (!body.reviewed || body.completed_sections.length !== sections.length || (!sections.length && !topic.data.video_url))) throw new BtbApiError("Complete every section and confirm you reviewed the material before submitting.");
  const result = await db.rpc("btb_save_training_record", { p_employee_id: identity.employeeId, p_topic_id: body.topic_id, p_topic_revision: body.topic_revision, p_version: body.version, p_sections: body.completed_sections, p_reviewed: body.reviewed, p_status: body.status, p_notes: body.notes.trim() });
  dbError(result.error, "Your training could not be saved. Your draft is still here.");
  if (!result.data?.[0]) throw new BtbApiError("The training save was not confirmed.", 503);
  return { record: result.data[0] };
});
