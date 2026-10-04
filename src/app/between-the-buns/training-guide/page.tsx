"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckSquare, FilePlus2, Plus, Trash2 } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import PrintButton from "@/components/PrintButton";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import {
  TRAINING_CATEGORIES,
  categoryLabel,
  groupByCategory,
  isTrainingCategory,
  matchesQuery,
  nextPosition,
  orderedSections,
  parseBody,
  totalMinutes,
  type TrainingSection,
  type TrainingTopic,
} from "@/lib/training";

const TOPIC_COLS = "id, title, category, est_minutes, published, position, created_by, location_id";
const SECTION_COLS = "id, topic_id, position, heading, body";

// The SOP library. Staff read published topics; managers draft, publish and
// reorder them. Sections are plain text — paragraphs plus "- " checklist lines.
export default function TrainingGuidePage() {
  return (
    <BtbFeatureGate feature="training_guide">
      {(readOnly) => <TrainingGuide readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function TrainingGuide({ readOnly }: { readOnly: boolean }) {
  const [topics, setTopics] = useState<TrainingTopic[]>([]);
  const [sections, setSections] = useState<TrainingSection[]>([]);
  const [allSections, setAllSections] = useState<TrainingSection[]>([]);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newTopic, setNewTopic] = useState({ title: "", category: "food_safety", est_minutes: "5" });
  const [newSection, setNewSection] = useState({ heading: "", body: "" });

  const loadTopics = async () => {
    const scope = locationScope();
    let q = supabase.from("training_topics").select(TOPIC_COLS).order("position").order("title");
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load the guide — run supabase/schema-training.sql, then reload.");
      setLoading(false);
      return;
    }
    const all = ((data ?? []) as TrainingTopic[]).filter((t) => (readOnly ? t.published : true));
    setTopics(all);
    // One cheap pass over every section so the search box reaches inside topics
    // and the print sheet can print the whole guide, not just the open topic.
    const { data: sec } = await supabase.from("training_sections").select(SECTION_COLS).limit(1000);
    const index: Record<string, string> = {};
    const flat: TrainingSection[] = (sec ?? []) as unknown as TrainingSection[];
    for (const s of flat) {
      index[s.topic_id] = `${index[s.topic_id] ?? ""}\n${s.body ?? ""}`;
    }
    setBodies(index);
    setAllSections(flat);
    setSelectedId((cur) => cur ?? all[0]?.id ?? null);
    setError(null);
    setLoading(false);
  };

  const loadSections = async (topicId: string | null) => {
    if (!topicId) {
      setSections([]);
      return;
    }
    const { data, error: err } = await supabase
      .from("training_sections")
      .select(SECTION_COLS)
      .eq("topic_id", topicId);
    if (err) {
      setError("Couldn't load sections — run supabase/schema-training.sql, then reload.");
      return;
    }
    setSections((data ?? []) as unknown as TrainingSection[]);
    setError(null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadTopics();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount load
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadSections(selectedId);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const visibleTopics = useMemo(
    () => topics.filter((t) => matchesQuery(t, bodies[t.id] ?? "", query)),
    [topics, bodies, query],
  );
  const groups = useMemo(() => groupByCategory(visibleTopics), [visibleTopics]);
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const ordered = useMemo(() => orderedSections(sections), [sections]);

  const createTopic = async () => {
    if (readOnly || saving) return;
    const title = newTopic.title.trim();
    if (!title) {
      setError("Give the topic a title first.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("training_topics")
      .insert({
        title,
        category: isTrainingCategory(newTopic.category) ? newTopic.category : "food_safety",
        est_minutes: Math.max(1, Number(newTopic.est_minutes) || 5),
        published: false,
        position: nextPosition(topics),
        created_by: null,
        location_id: activeLocationId(),
      })
      .select(TOPIC_COLS);
    if (err) {
      setError("Couldn't create the topic — run supabase/schema-training.sql, then retry.");
      setSaving(false);
      return;
    }
    const created = (data?.[0] as TrainingTopic | undefined) ?? null;
    setNewTopic({ title: "", category: "food_safety", est_minutes: "5" });
    setNotice(created ? `Draft created: ${created.title}` : "Draft created");
    setSaving(false);
    await loadTopics();
    if (created) setSelectedId(created.id);
  };

  const addSection = async () => {
    if (readOnly || saving || !selectedId) return;
    const heading = newSection.heading.trim();
    if (!heading) {
      setError("Sections need a heading.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("training_sections").insert({
      topic_id: selectedId,
      position: nextPosition(sections),
      heading,
      body: newSection.body.trim(),
    });
    if (err) {
      setError("Couldn't save the section — run supabase/schema-training.sql, then retry.");
      setSaving(false);
      return;
    }
    setNewSection({ heading: "", body: "" });
    setNotice(`Section added: ${heading}`);
    setSaving(false);
    await loadSections(selectedId);
  };

  const togglePublished = async (t: TrainingTopic) => {
    if (readOnly) return;
    setError(null);
    const { error: err } = await supabase
      .from("training_topics")
      .update({ published: !t.published })
      .eq("id", t.id);
    if (err) {
      setError("Couldn't publish — run supabase/schema-training.sql, then retry.");
      return;
    }
    setNotice(t.published ? `Unpublished: ${t.title}` : `Published: ${t.title}`);
    await loadTopics();
  };

  const removeTopic = async (id: string) => {
    if (readOnly) return;
    setError(null);
    const { error: err } = await supabase.from("training_topics").delete().eq("id", id);
    if (err) {
      setError("Couldn't delete the topic — run supabase/schema-training.sql, then retry.");
      return;
    }
    setNotice("Topic deleted (its sections went too)");
    setSelectedId(null);
    await loadTopics();
  };

  const removeSection = async (id: string) => {
    if (readOnly || !selectedId) return;
    setError(null);
    const { error: err } = await supabase.from("training_sections").delete().eq("id", id);
    if (err) {
      setError("Couldn't delete the section — run supabase/schema-training.sql, then retry.");
      return;
    }
    await loadSections(selectedId);
  };

  return (
    <div>
      {/* Interactive UI — hidden when the guide goes to the printer. */}
      <div className="print:hidden">
        <PageHeader
          title="Training Guide"
          subtitle={`${topics.length} topic${topics.length === 1 ? "" : "s"} · about ${totalMinutes(topics)} min of reading`}
          action={
            <div className="flex items-center gap-2">
              {notice && <Badge accent="green">{notice}</Badge>}
              <PrintButton label="Print Guide" />
            </div>
          }
        />

        <div className="mb-5">
          <Input
            accent="purple"
            type="search"
            placeholder="Search titles, categories and section text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            {loading ? (
              <Card className="p-6 text-center text-sm text-slate-400">Loading…</Card>
            ) : visibleTopics.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-400">
                {query ? "Nothing matches that search." : "No topics yet — managers can add the first one."}
              </Card>
            ) : (
              Object.entries(groups).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                    {categoryLabel(cat)}
                  </p>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                          selectedId === t.id
                            ? "border-purple-300 bg-purple-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{t.title}</span>
                          <span className="text-[11px] text-slate-400 shrink-0">{t.est_minutes} min</span>
                        </span>
                        {!t.published && !readOnly && (
                          <span className="mt-1 inline-block">
                            <Badge accent="amber">Draft</Badge>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}

            {!readOnly && (
              <Card className="p-4">
                <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4 text-purple-600" /> New topic
                </p>
                <div className="space-y-3">
                  <label className="block text-sm">
                    <span className="block text-xs font-medium text-slate-500 mb-1">Title *</span>
                    <Input
                      accent="purple"
                      value={newTopic.title}
                      onChange={(e) => setNewTopic((t) => ({ ...t, title: e.target.value }))}
                      placeholder="Glove & handwashing policy"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-xs font-medium text-slate-500 mb-1">Category</span>
                    <select
                      className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full"
                      value={newTopic.category}
                      onChange={(e) => setNewTopic((t) => ({ ...t, category: e.target.value }))}
                    >
                      {TRAINING_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="block text-xs font-medium text-slate-500 mb-1">Est. minutes</span>
                    <Input
                      accent="purple"
                      type="number"
                      min="1"
                      value={newTopic.est_minutes}
                      onChange={(e) => setNewTopic((t) => ({ ...t, est_minutes: e.target.value }))}
                    />
                  </label>
                  <Button accent="purple" onClick={createTopic} disabled={saving}>
                    {saving ? "Saving…" : "Create Draft"}
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            {!selected ? (
              <Card className="p-8 text-center text-sm text-slate-400">Pick a topic from the list.</Card>
            ) : (
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-purple-600" /> {selected.title}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {categoryLabel(selected.category)} · {selected.est_minutes} min
                      {!selected.published && !readOnly && " · draft"}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Button
                        accent="purple"
                        variant="soft"
                        onClick={() => togglePublished(selected)}
                      >
                        {selected.published ? "Unpublish" : "Publish"}
                      </Button>
                      <Button accent="red" variant="soft" onClick={() => removeTopic(selected.id)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-6">
                  {ordered.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No sections yet{readOnly ? "" : " — add the first one below"}.
                    </p>
                  ) : (
                    ordered.map((s) => {
                      const { paragraphs, checklist } = parseBody(s.body);
                      return (
                        <section key={s.id}>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{s.heading}</h3>
                            {!readOnly && (
                              <button
                                aria-label={`Delete ${s.heading}`}
                                className="text-slate-300 hover:text-red-600"
                                onClick={() => removeSection(s.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {paragraphs.map((p, i) => (
                            <p key={i} className="mt-2 text-sm text-slate-600 leading-relaxed">
                              {p}
                            </p>
                          ))}
                          {checklist.length > 0 && (
                            <ul className="mt-3 space-y-1.5">
                              {checklist.map((c, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                  <CheckSquare className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" />
                                  {c}
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      );
                    })
                  )}
                </div>

                {!readOnly && (
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-purple-600" /> Add a section
                    </p>
                    <div className="space-y-3">
                      <label className="block text-sm">
                        <span className="block text-xs font-medium text-slate-500 mb-1">Heading *</span>
                        <Input
                          accent="purple"
                          value={newSection.heading}
                          onChange={(e) => setNewSection((s) => ({ ...s, heading: e.target.value }))}
                          placeholder="Before service"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="block text-xs font-medium text-slate-500 mb-1">
                          Body — blank line = new paragraph, lines starting with “- ” become checklist items
                        </span>
                        <textarea
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[7rem]"
                          value={newSection.body}
                          onChange={(e) => setNewSection((s) => ({ ...s, body: e.target.value }))}
                          placeholder={"Wash hands for 20 seconds.\n\n- before putting gloves on\n- after touching raw beef"}
                        />
                      </label>
                      <Button accent="purple" onClick={addSection} disabled={saving}>
                        {saving ? "Saving…" : "Add Section"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Full guide for print — every visible topic with all its sections. */}
      <div id="print-section" className="hidden print:block max-w-4xl mx-auto px-4 py-6 text-gray-900">
        <div className="mb-5 border-b border-gray-400 pb-3">
          <h1 className="text-2xl font-bold">Training Guide</h1>
          <p className="text-xs mt-1">
            {visibleTopics.length} topic{visibleTopics.length === 1 ? "" : "s"} · about{" "}
            {totalMinutes(visibleTopics)} min of reading
          </p>
        </div>

        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">
              {categoryLabel(cat)}
            </h2>
            {items.map((t) => (
              <div key={t.id} className="mb-5 break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-bold">{t.title}</h3>
                  <span className="text-xs text-gray-500">{t.est_minutes} min</span>
                </div>
                {!t.published && <p className="text-xs italic text-gray-500">Draft — not published to staff</p>}

                {allSections
                  .filter((s) => s.topic_id === t.id)
                  .sort((a, b) => a.position - b.position)
                  .map((s) => {
                    const { paragraphs, checklist } = parseBody(s.body);
                    return (
                      <div key={s.id} className="mt-3">
                        <h4 className="text-sm font-bold uppercase tracking-wide">{s.heading}</h4>
                        {paragraphs.map((p, i) => (
                          <p key={i} className="mt-1.5 text-sm leading-relaxed">
                            {p}
                          </p>
                        ))}
                        {checklist.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm">
                            {checklist.map((c, i) => (
                              <li key={i}>☐ {c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        ))}

        <p className="text-xs text-gray-500 text-center mt-8">© Between the Buns — Training Guide</p>
      </div>
    </div>
  );
}
