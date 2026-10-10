// Training Guide — body parsing (checklists, reading time), search and
// ordering. Pure helpers shared by the guide page and its tests.

export const TRAINING_CATEGORIES = ["food_safety", "cleaning", "equipment", "service", "safety"] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

export interface TrainingTopic {
  id: string;
  title: string;
  category: string;
  est_minutes: number;
  published: boolean;
  position: number;
  created_by?: string | null;
  /** Optional training video — YouTube link or direct mp4 URL. */
  video_url?: string | null;
}

export interface TrainingSection {
  id: string;
  topic_id: string;
  position: number;
  heading: string;
  body: string;
}

export function isTrainingCategory(v: unknown): v is TrainingCategory {
  return typeof v === "string" && (TRAINING_CATEGORIES as readonly string[]).includes(v);
}

export const CATEGORY_LABEL: Record<TrainingCategory, string> = {
  food_safety: "Food safety",
  cleaning: "Cleaning",
  equipment: "Equipment",
  service: "Service",
  safety: "Workplace safety",
};

export const categoryLabel = (v: string): string =>
  isTrainingCategory(v) ? CATEGORY_LABEL[v] : v.charAt(0).toUpperCase() + v.slice(1);

export function isCategoryAccent(v: string): "red" | "amber" | "purple" | "green" | "slate" {
  if (v === "food_safety") return "red";
  if (v === "cleaning") return "green";
  if (v === "equipment") return "purple";
  if (v === "service") return "amber";
  return "slate";
}

/** Body → paragraphs (blank-line separated; "- " lines are pulled into a checklist). */
export interface ParsedBody {
  paragraphs: string[];
  checklist: string[];
}

export function parseBody(body: string): ParsedBody {
  const paragraphs: string[] = [];
  const checklist: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) {
      paragraphs.push(buffer.join(" "));
      buffer = [];
    }
  };
  for (const raw of (body ?? "").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flush();
      checklist.push(line.slice(2).replace(/^\[[ xX]\]\s*/, ""));
    } else if (line === "") {
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return { paragraphs, checklist };
}

/** Reading time from the body — 200 wpm, always at least a minute. */
export function readingMinutes(body: string): number {
  const words = (body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Case-insensitive match over title + category + every body line. */
export function matchesQuery(topic: TrainingTopic, bodies: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    topic.title.toLowerCase().includes(q) ||
    topic.category.toLowerCase().includes(q) ||
    bodies.toLowerCase().includes(q)
  );
}

/** Group topics by category, each group in `position` order; empty groups dropped. */
export function groupByCategory<T extends TrainingTopic>(topics: readonly T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const t of [...topics].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))) {
    const key = isTrainingCategory(t.category) ? t.category : "other";
    (out[key] ??= []).push(t);
  }
  return out;
}

/** Next free position in a list (append-to-end ordering). */
export const nextPosition = (items: readonly { position: number }[]): number =>
  items.reduce((max, i) => Math.max(max, Number(i.position) || 0), -1) + 1;

/** Every section in order, defensively sorted by `position`. */
export const orderedSections = <T extends { position: number }>(sections: readonly T[]): T[] =>
  [...sections].sort((a, b) => a.position - b.position);

/** Guide-wide word count → the "full guide takes N minutes" subtitle. */
export function totalMinutes(topics: readonly TrainingTopic[]): number {
  return topics.reduce((sum, t) => sum + Math.max(0, Number(t.est_minutes) || 0), 0);
}
