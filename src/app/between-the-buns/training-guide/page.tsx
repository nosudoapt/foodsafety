"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Check, Pencil, Plus, Save, Search, Send, Trash2 } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import PrintButton from "@/components/PrintButton";
import { Badge, Button, Input, PageHeader, TabList } from "@/components/ui";
import { IndividualLoginNotice, LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { TrainingProgressTable, TrainingStatusBadge } from "@/components/btb/TrainingProgress";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { TRAINING_CATEGORIES, categoryLabel, orderedSections, parseBody, type TrainingSection } from "@/lib/training";
import { trainingStatus, type BtbTrainingTopic, type TrainingData, type TrainingRecord } from "@/lib/btb-training";
import { isVersion } from "@/lib/btb-team";

export default function TrainingPage() {
  return <BtbFeatureGate feature="training_guide" wide>{(readOnly) => <TrainingWorkspace readOnly={readOnly} />}</BtbFeatureGate>;
}

function TrainingWorkspace({ readOnly }: { readOnly: boolean }) {
  const { identity } = useBtbWorkspace();
  const { data, loading, error, reload, update } = useBtbData<TrainingData>("/api/btb/training");
  const teamView = identity && ["manager", "supervisor", "corporate"].includes(identity.role);
  const [tab, setTab] = useState<"library" | "team">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "team" ? "team" : "library");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<BtbTrainingTopic | "new" | null>(null);
  const [reviewing, setReviewing] = useState<TrainingRecord | null>(null);
  const [notice, setNotice] = useState("");
  const visible = data?.topics.filter((topic) => `${topic.title} ${categoryLabel(topic.category)} ${data.sections.filter((section) => section.topic_id === topic.id).map((section) => `${section.heading} ${section.body}`).join(" ")}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const topic = visible.find((topic) => topic.id === selected) ?? visible[0];
  const pending = data?.records.filter((record) => record.status === "pending" && data.topics.some((topic) => topic.id === record.topic_id && topic.published && topic.revision === record.topic_revision)) ?? [];
  const savedRecord = (record: TrainingRecord) => update((current) => ({ ...current, records: [...current.records.filter((item) => item.id !== record.id), record] }));
  const activeTab = teamView ? tab : "library";
  return <div className="ops-workspace"><div className="training-screen ops-workspace"><PageHeader title="Training & progress" subtitle="Learn the routines. Practise the work. Get your manager’s approval." action={<div className="ui-actions"><PrintButton label="Print guide" />{!readOnly && <Button onClick={() => setEditing("new")} disabled={!data}><Plus size={18} />New module</Button>}</div>} />
    {teamView && <TabList id="training" label="Training workspace" value={tab} onChange={setTab} tabs={[{ id: "library", label: "Training library" }, { id: "team", label: "Team progress" }]} />}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && activeTab === "library" && <div className="ops-workspace" role={teamView ? "tabpanel" : undefined} id="training-panel-library" aria-labelledby={teamView ? "training-tab-library" : undefined}>
      {!identity?.employeeId && <IndividualLoginNotice next="/between-the-buns/training-guide" />}
      <label className="dash-search training-search"><Search size={17} /><span className="sr-only">Search training modules</span><input type="search" placeholder="Search modules and instructions" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="training-layout"><nav className="training-library" aria-label="Training modules">{visible.map((item) => <button key={item.id} aria-current={item.id === topic?.id ? "true" : undefined} onClick={() => setSelected(item.id)}><span className="training-library__title">{item.title}</span><span className="ops-meta">{categoryLabel(item.category)} · {item.est_minutes} min</span>{item.published ? identity?.employeeId && <TrainingStatusBadge status={trainingStatus(data.records.find((record) => record.employee_id === identity.employeeId && record.topic_id === item.id), item)} /> : <Badge accent="amber">Draft</Badge>}</button>)}{!visible.length && <div className="ui-empty"><BookOpen size={28} /><h2>{query ? "No matching modules" : "Your library starts here"}</h2><p>{query ? "Try another title or instruction." : "A manager can create and publish the first training module."}</p></div>}</nav>
      {topic && <TrainingLesson key={`${topic.id}:${topic.revision}`} topic={topic} sections={orderedSections(data.sections.filter((section) => section.topic_id === topic.id))} record={data.records.find((record) => record.employee_id === identity?.employeeId && record.topic_id === topic.id)} onSaved={savedRecord} onReload={reload} onEdit={readOnly ? undefined : () => setEditing(topic)} />}</div>
    </div>}
    {data && activeTab === "team" && <div role="tabpanel" id="training-panel-team" aria-labelledby="training-tab-team" className="ops-workspace"><div className="ops-section-heading"><h2>Employee completion</h2><Badge accent="purple">{pending.length} awaiting manager</Badge></div><TrainingProgressTable data={data} ownId={identity?.employeeId} onReview={!readOnly ? setReviewing : undefined} />
      {!!pending.length && <section className="ops-workspace"><h2 className="training-subheading">Awaiting manager approval</h2><div className="training-review-queue">{pending.map((record) => <article key={record.id}><div><h3>{data.employees.find((employee) => employee.id === record.employee_id)?.name ?? "Employee"}</h3><p>{data.topics.find((topic) => topic.id === record.topic_id)?.title}</p><span className="ops-meta">Submitted {record.submitted_at?.slice(0, 10)}</span></div>{!readOnly ? <Button variant="soft" disabled={record.employee_id === identity?.employeeId} onClick={() => setReviewing(record)}>{record.employee_id === identity?.employeeId ? "Another manager must review" : "Review training"}</Button> : <TrainingStatusBadge status="pending" />}</article>)}</div></section>}
    </div>}
    {editing && <TrainingEditor key={editing === "new" ? "new" : editing.id} topic={editing === "new" ? null : editing} sections={editing === "new" ? [] : orderedSections(data?.sections.filter((section) => section.topic_id === editing.id) ?? [])} onClose={() => setEditing(null)} onSaved={(topic, sections) => { update((current) => ({ ...current, topics: [...current.topics.filter((item) => item.id !== topic.id), topic].sort((a, b) => a.position - b.position), sections: [...current.sections.filter((section) => section.topic_id !== topic.id), ...sections] })); setEditing(null); setSelected(topic.id); setNotice(`“${topic.title}” saved${topic.published ? " and published" : " as a draft"}.`); }} />}
    {reviewing && data && <TrainingReviewForm record={reviewing} data={data} onClose={() => setReviewing(null)} onSaved={(record) => { savedRecord(record); setReviewing(null); setNotice(record.status === "approved" ? "Training approved. The employee’s progress is updated." : "Feedback sent. The employee can revisit and resubmit this module."); reload(); }} />}
  </div>
  {data && <div id="print-section" className="training-print"><h1>Between the Buns · Training guide</h1>{data.topics.filter((item) => item.published).map((item) => <section key={item.id}><h2>{item.title}</h2><p>{categoryLabel(item.category)} · {item.est_minutes} minutes · revision {item.revision}</p>{orderedSections(data.sections.filter((section) => section.topic_id === item.id)).map((section) => <div key={section.id}><h3>{section.heading}</h3><TrainingBody body={section.body} /></div>)}</section>)}</div>}
  </div>;
}

function TrainingBody({ body }: { body: string }) {
  const parsed = parseBody(body);
  return <div className="training-body">{parsed.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{!!parsed.checklist.length && <ul>{parsed.checklist.map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>;
}

function TrainingVideo({ url, title }: { url: string; title: string }) {
  let youtube = "";
  try { const parsed = new URL(url); if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname)) youtube = parsed.searchParams.get("v") ?? parsed.pathname.split("/")[2] ?? ""; if (parsed.hostname === "youtu.be") youtube = parsed.pathname.slice(1); } catch { return null; }
  return youtube && /^[\w-]+$/.test(youtube) ? <iframe className="training-video" src={`https://www.youtube-nocookie.com/embed/${youtube}`} title={`${title} training video`} allowFullScreen loading="lazy" /> : <video className="training-video" src={url} controls preload="metadata" aria-label={`${title} training video`} />;
}

interface TrainingDraft { version: number; sections: string[]; reviewed: boolean; notes: string }
function TrainingLesson({ topic, sections, record, onEdit, onSaved, onReload }: { topic: BtbTrainingTopic; sections: TrainingSection[]; record?: TrainingRecord; onEdit?: () => void; onSaved: (record: TrainingRecord) => void; onReload: () => void }) {
  const { identity } = useBtbWorkspace();
  const storageKey = `btb:training:v2:${identity?.employeeId}:${topic.id}:${topic.revision}`;
  const [draft, setDraft] = useState<TrainingDraft | null>(() => {
    if (!identity?.employeeId) return null;
    try { const value = JSON.parse(localStorage.getItem(storageKey) ?? "null"); return value && isVersion(value.version) && typeof value.reviewed === "boolean" && typeof value.notes === "string" && Array.isArray(value.sections) && value.sections.every((id: string) => sections.some((section) => section.id === id)) ? value : null; } catch { return null; }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const status = trainingStatus(record, topic);
  const locked = status === "pending" || status === "approved" || !identity?.employeeId || !topic.published;
  const current = record?.topic_revision === topic.revision ? record : undefined;
  const values = draft ?? { version: record?.version ?? 0, sections: current?.completed_sections ?? [], reviewed: current?.reviewed ?? false, notes: current?.notes ?? "" };
  const stale = !!draft && draft.version !== (record?.version ?? 0);
  const persist = (next: TrainingDraft | null) => {
    setDraft(next); setNotice("");
    try { if (next) localStorage.setItem(storageKey, JSON.stringify(next)); else localStorage.removeItem(storageKey); }
    catch { setError("This browser cannot retain your draft after closing. Keep this page open until you save."); }
  };
  const save = async (status: "in_progress" | "pending") => {
    if (saving || locked || stale) return;
    setSaving(true); setError(""); setNotice("");
    try { const result = await fetchJson<{ record: TrainingRecord }>("/api/btb/training", jsonRequest({ topic_id: topic.id, topic_revision: topic.revision, version: values.version, completed_sections: values.sections, reviewed: values.reviewed, notes: values.notes, status })); onSaved(result.record); persist(null); setNotice(status === "pending" ? "Submitted. A manager will review your training before it counts as completed." : "Your training progress is saved."); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <article className="training-lesson"><header><div><p className="ops-meta">{categoryLabel(topic.category)} · {topic.est_minutes} minutes · revision {topic.revision}</p><h2>{topic.title}</h2></div>{onEdit && <Button variant="ghost" onClick={onEdit}><Pencil size={16} />Edit module</Button>}</header><div className="ui-actions">{topic.published ? <TrainingStatusBadge status={status} /> : <Badge accent="amber">Unpublished draft</Badge>}{identity?.employeeId && <span className="ops-meta">{values.sections.length}/{sections.length} sections checked</span>}</div>
    {status === "needs_update" && <p className="ui-notice ui-notice--warning">This module has changed since your last submission. Review the current material and submit it again for manager approval.</p>}
    {record?.review_notes && <div className="training-feedback"><strong>Manager feedback · {record.reviewed_by_name}</strong><p>{record.review_notes}</p></div>}
    {status === "approved" && <p className="ui-notice ui-notice--success">Approved by {record?.reviewed_by_name} on {record?.reviewed_at?.slice(0, 10)}.</p>}
    {topic.video_url && <TrainingVideo url={topic.video_url} title={topic.title} />}
    {sections.map((section, index) => <section className="training-lesson-section" key={section.id}><h3><span>{String(index + 1).padStart(2, "0")}</span>{section.heading}</h3><TrainingBody body={section.body} />{identity?.employeeId && topic.published && <label className="ops-checkbox training-check"><input type="checkbox" disabled={locked || saving} checked={values.sections.includes(section.id)} onChange={(event) => persist({ ...values, sections: event.target.checked ? [...values.sections, section.id] : values.sections.filter((id) => id !== section.id) })} />I completed “{section.heading}”</label>}</section>)}
    {!sections.length && !topic.video_url && <p className="ops-meta">Add sections or a video before publishing this module.</p>}
    {identity?.employeeId && topic.published && <div className="training-submit"><label className="ops-checkbox"><input type="checkbox" disabled={locked || saving} checked={values.reviewed} onChange={(event) => persist({ ...values, reviewed: event.target.checked })} />I have reviewed all of this material and am ready to demonstrate it to my manager.</label><label className="ui-form-stack">Notes for your manager <span className="ops-meta">optional</span><textarea className="ui-input" rows={3} maxLength={2000} disabled={locked || saving} value={values.notes} onChange={(event) => persist({ ...values, notes: event.target.value })} /></label>
      {stale && !locked && <div className="ui-notice ui-notice--warning"><div>Your saved progress changed. Review your selections before applying this draft.<Button variant="ghost" onClick={() => persist({ ...values, version: record?.version ?? 0 })}>Use my progress with latest</Button></div></div>}
      {error && <div className="ui-notice ui-notice--error" role="alert"><div>{error}<br /><Button variant="ghost" disabled={saving} onClick={onReload}>Reload training</Button></div></div>}{notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      {!locked && <div className="ui-actions"><Button variant="ghost" disabled={saving || stale} onClick={() => save("in_progress")}><Save size={16} />{saving ? "Saving…" : "Save progress"}</Button><Button disabled={saving || stale || !values.reviewed || values.sections.length !== sections.length} onClick={() => save("pending")}><Send size={16} />Submit for manager approval</Button>{draft && <Button variant="ghost" disabled={saving} onClick={() => persist(null)}>Discard draft</Button>}</div>}
    </div>}
  </article>;
}

function TrainingEditor({ topic, sections, onClose, onSaved }: { topic: BtbTrainingTopic | null; sections: TrainingSection[]; onClose: () => void; onSaved: (topic: BtbTrainingTopic, sections: TrainingSection[]) => void }) {
  const [form, setForm] = useState({ title: topic?.title ?? "", category: topic?.category ?? "food_safety", est_minutes: topic?.est_minutes ?? 5, video_url: topic?.video_url ?? "", published: topic?.published ?? false });
  const [draftSections, setDraftSections] = useState(sections.map(({ id, heading, body }) => ({ id, heading, body })));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const move = (index: number, direction: number) => { const next = [...draftSections]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setDraftSections(next); };
  const upload = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (!file.type.startsWith("video/") || file.size > 100 * 1024 * 1024) { setError("Choose a video under 100 MB, or use an HTTPS video link."); return; }
    setUploading(true); setError("");
    try { const body = new FormData(); body.set("file", file); const result = await fetchJson<{ url: string }>("/api/btb/training/video", { method: "POST", body, signal: AbortSignal.timeout(120_000) }); setForm((previous) => ({ ...previous, video_url: result.url })); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setUploading(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || uploading) return;
    setSaving(true); setError("");
    try { const result = await fetchJson<{ topic: BtbTrainingTopic; sections: TrainingSection[] }>("/api/btb/training/topics", jsonRequest({ ...form, sections: draftSections, id: topic?.id ?? null, revision: topic?.revision ?? 0 })); onSaved(result.topic, result.sections); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title={topic ? "Edit training module" : "Create training module"} description={topic ? "Saving a new revision asks employees to review the updated material again." : "Build the instructions, then publish when they are ready for the team."} busy={saving || uploading} onClose={onClose}><form onSubmit={save}>{error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}<fieldset className="ui-form-stack" disabled={saving || uploading}>
    <label>Module title<Input data-modal-autofocus required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><div className="ops-form-grid"><label>Category<select className="ui-input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{TRAINING_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label><label>Estimated minutes<Input type="number" required min={1} max={480} value={form.est_minutes} onChange={(event) => setForm({ ...form, est_minutes: Number(event.target.value) })} /></label></div>
    <label>Video link <span>optional</span><Input type="url" placeholder="https://…" maxLength={2000} value={form.video_url} onChange={(event) => setForm({ ...form, video_url: event.target.value })} /></label><label>Upload a video <span>up to 100 MB</span><input type="file" accept="video/*" onChange={(event) => void upload(event.target.files?.[0])} /></label>
    {draftSections.map((section, index) => <div className="training-section-editor ui-form-stack" key={section.id}><div className="ops-section-heading"><strong>Section {index + 1}</strong><div className="ui-actions"><button type="button" className="ui-iconbutton" disabled={!index} aria-label={`Move section ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" className="ui-iconbutton" disabled={index === draftSections.length - 1} aria-label={`Move section ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" className="ui-iconbutton ui-iconbutton--danger" aria-label={`Remove section ${index + 1}`} onClick={() => setDraftSections(draftSections.filter((item) => item.id !== section.id))}><Trash2 size={16} /></button></div></div><label>Section heading<Input required maxLength={200} value={section.heading} onChange={(event) => setDraftSections(draftSections.map((item) => item.id === section.id ? { ...item, heading: event.target.value } : item))} /></label><label>Instructions<textarea className="ui-input" rows={5} maxLength={20000} value={section.body} onChange={(event) => setDraftSections(draftSections.map((item) => item.id === section.id ? { ...item, body: event.target.value } : item))} /><small>Blank lines separate paragraphs. Start a line with “- ” for a checklist bullet.</small></label></div>)}
    <Button variant="ghost" disabled={draftSections.length >= 100} onClick={() => setDraftSections([...draftSections, { id: crypto.randomUUID(), heading: "", body: "" }])}><Plus size={16} />Add section</Button><label className="ops-checkbox"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} />Publish to employees</label>
  </fieldset>{uploading && <p role="status" className="ops-meta">Uploading video…</p>}<div className="ui-modal__actions"><Button variant="ghost" disabled={saving || uploading} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || uploading}>{saving ? "Saving…" : "Save module"}</Button></div></form></Modal>;
}

function TrainingReviewForm({ record, data, onClose, onSaved }: { record: TrainingRecord; data: TrainingData; onClose: () => void; onSaved: (record: TrainingRecord) => void }) {
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<"approved" | "changes_requested">("approved");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const topic = data.topics.find((topic) => topic.id === record.topic_id);
  const reviews = data.reviews.filter((review) => review.record_id === record.id);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    try { const result = await fetchJson<{ record: TrainingRecord }>("/api/btb/training/review", jsonRequest({ id: record.id, version: record.version, notes, decision })); onSaved(result.record); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title="Review employee training" description={`${data.employees.find((employee) => employee.id === record.employee_id)?.name ?? "Employee"} · ${topic?.title ?? "Training module"}`} busy={saving} onClose={onClose}><form onSubmit={submit}><div className="ops-workspace"><p className="ops-meta">Module revision {record.topic_revision} · submitted {record.submitted_at?.slice(0, 10)}</p><ul className="training-reviewed-sections">{data.sections.filter((section) => section.topic_id === record.topic_id).map((section) => <li key={section.id}><Check size={15} />{section.heading}</li>)}</ul>{record.notes && <div className="training-feedback"><strong>Employee notes</strong><p>{record.notes}</p></div>}{error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}<fieldset className="ui-form-stack" disabled={saving}><label>Manager decision<select className="ui-input" data-modal-autofocus value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="approved">Approve completed training</option><option value="changes_requested">Request changes</option></select></label><label>Feedback {decision === "changes_requested" && <span>required</span>}<textarea className="ui-input" required={decision === "changes_requested"} maxLength={2000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></fieldset>{!!reviews.length && <details><summary>Previous manager reviews ({reviews.length})</summary>{reviews.map((review) => <p className="ops-meta" key={review.id}>{review.created_at.slice(0, 10)} · {review.reviewer_name} · {review.decision === "approved" ? "Approved" : "Changes requested"}{review.notes && `: ${review.notes}`}</p>)}</details>}</div><div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving review…" : decision === "approved" ? "Approve training" : "Send feedback"}</Button></div></form></Modal>;
}
