import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./btb-api";
import type { TrainingManual, TrainingSection } from "./training";

/** [] = shared library only; null = authorized group-wide access. */
export async function readTrainingManuals(db: SupabaseClient, locationIds: readonly string[] | null): Promise<TrainingManual[]> {
  const topics = await readAll<Omit<TrainingManual, "sections">>((from, to) => {
    let query = db.from("training_topics").select("id,title,category").eq("published", true);
    if (locationIds !== null) {
      query = locationIds.length
        ? query.or(["location_id.is.null", ...locationIds.map((id) => `location_id.eq.${id}`)].join(","))
        : query.is("location_id", null);
    }
    return query.order("position").order("title").order("id").range(from, to);
  }, "Published training could not be loaded. Please try printing again.");

  const byTopic = new Map<string, TrainingManual["sections"]>();
  // Keep topic filters within URL limits while paging every section.
  for (let offset = 0; offset < topics.length; offset += 100) {
    const ids = topics.slice(offset, offset + 100).map((topic) => topic.id);
    const sections = await readAll<TrainingSection>((from, to) => db.from("training_sections")
      .select("id,topic_id,position,heading,body").in("topic_id", ids)
      .order("position").order("id").range(from, to), "Training sections could not be loaded. Please try printing again.");
    for (const section of sections) {
      const list = byTopic.get(section.topic_id) ?? [];
      list.push({ heading: section.heading, body: section.body });
      byTopic.set(section.topic_id, list);
    }
  }
  return topics.map((topic) => ({ ...topic, sections: byTopic.get(topic.id) ?? [] }));
}
