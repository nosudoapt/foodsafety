"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { Badge, Button, Input, PageHeader } from "@/components/ui";
import { useBtbData } from "./useBtbData";
import { LoadState, jsonRequest, messageOf } from "./Feedback";
import { fetchJson } from "@/lib/fetch-json";
import { FRANCHISE_SECTIONS, FRANCHISE_TASKS, type FranchiseTaskState } from "@/lib/btb-franchise";

export default function FranchiseChecklist({ readOnly }: { readOnly: boolean }) {
  const { data, loading, error, reload, update } = useBtbData<{ tasks: FranchiseTaskState[] }>("/api/btb/franchise-checklist");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number[]>([1]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState("");
  const [saveError, setSaveError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const tasks = data?.tasks ?? [];
  const stateFor = (key: string, phase: string, task: string): FranchiseTaskState => tasks.find((item) => item.task_key === key) ?? { task_key: key, phase, task, done: false, done_by_name: null, done_at: null, version: 0, custom: false };
  const extras = tasks.filter((task) => task.custom);
  const total = FRANCHISE_TASKS.length + extras.length;
  const completed = FRANCHISE_TASKS.filter((task) => tasks.some((saved) => saved.task_key === task.key && saved.done)).length + extras.filter((task) => task.done).length;
  const updateTask = (task: FranchiseTaskState) => update((current) => ({ tasks: [...current.tasks.filter((item) => item.task_key !== task.task_key), task] }));
  const toggle = async (task: FranchiseTaskState, done: boolean) => {
    if (busy || readOnly) return;
    setDrafts((previous) => ({ ...previous, [task.task_key]: done })); setBusy(task.task_key); setSaveError(""); setNotice("");
    try { const result = await fetchJson<{ task: FranchiseTaskState }>("/api/btb/franchise-checklist", jsonRequest({ task_key: task.task_key, version: task.version, done })); updateTask(result.task); setDrafts((previous) => { const next = { ...previous }; delete next[task.task_key]; return next; }); setNotice("Launch progress saved."); }
    catch (cause) { setSaveError(messageOf(cause)); }
    finally { setBusy(""); }
  };
  const remove = async (task: FranchiseTaskState) => {
    if (busy || readOnly) return; setBusy(task.task_key); setSaveError("");
    try { await fetchJson("/api/btb/franchise-checklist", jsonRequest({ task_key: task.task_key, version: task.version }, "DELETE")); update((current) => ({ tasks: current.tasks.filter((item) => item.task_key !== task.task_key) })); setNotice("Additional task removed."); }
    catch (cause) { setSaveError(messageOf(cause)); }
    finally { setBusy(""); }
  };
  const row = (task: FranchiseTaskState) => <div key={task.task_key} className="franchise-task"><label><input type="checkbox" checked={drafts[task.task_key] ?? task.done} disabled={readOnly || !!busy} onChange={(event) => void toggle(task, event.target.checked)} /><span>{task.task}<small>{task.task_key in drafts ? busy === task.task_key ? "Saving…" : "Change not saved" : task.done ? `${task.done_by_name ?? "Completed"}${task.done_at ? ` · ${task.done_at.slice(0, 10)}` : ""}` : ""}</small></span></label>{task.task_key in drafts && !busy && <Button variant="soft" onClick={() => toggle(task, drafts[task.task_key])}>Retry</Button>}{task.custom && !readOnly && <button className="ui-iconbutton ui-iconbutton--danger" disabled={!!busy} aria-label={`Remove additional task: ${task.task}`} onClick={() => remove(task)}><Trash2 size={16} /></button>}</div>;
  const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const unmatched = extras.filter((task) => !FRANCHISE_SECTIONS.some((section) => section.title === task.phase) && match(`${task.phase} ${task.task}`));
  return <div className="ops-workspace"><PageHeader title="Franchise opening checklist" subtitle="The complete 16-section launch plan, from franchise setup to grand opening day." action={!readOnly && <Button disabled={!data} onClick={() => setAdding(true)}><Plus size={18} />Add a task</Button>} />
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && <><div className="franchise-progress"><div><strong>{completed}<span> / {total} tasks complete</span></strong><Badge accent="purple">16 required sections</Badge></div><progress className="ops-progress" value={completed} max={total} aria-label={`${completed} of ${total} opening tasks completed`} /></div>
      <div className="ops-toolbar"><label className="dash-search"><Search size={17} /><span className="sr-only">Search franchise tasks</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search permits, equipment, launch…" /></label><div className="ui-actions"><Button variant="ghost" onClick={() => setExpanded(FRANCHISE_SECTIONS.map((section) => section.number))}>Expand all</Button><Button variant="ghost" onClick={() => setExpanded([])}>Collapse all</Button></div></div>
      {saveError && <div className="ui-notice ui-notice--error" role="alert"><div>{saveError} Your pending task change is marked below.<br /><Button variant="ghost" disabled={!!busy || loading} onClick={reload}>Reload latest progress</Button></div></div>}{notice && <p className="ops-meta" role="status">{notice}</p>}
      <div className="franchise-sections">{FRANCHISE_SECTIONS.map((section) => {
        const template = FRANCHISE_TASKS.filter((task) => task.section === section.number);
        const additional = extras.filter((task) => task.phase === section.title);
        const all = [...template.map((task) => stateFor(task.key, task.phase, task.task)), ...additional];
        const headingMatch = match(section.title);
        if (query && !headingMatch && !all.some((task) => match(task.task))) return null;
        const open = !!query || expanded.includes(section.number);
        const done = all.filter((task) => task.done).length;
        return <section key={section.number} className="franchise-section"><button className="franchise-section__heading" aria-expanded={open} aria-controls={`franchise-section-${section.number}`} onClick={() => setExpanded(open ? expanded.filter((number) => number !== section.number) : [...expanded, section.number])}><span className="franchise-number">{done === all.length ? <Check size={18} /> : String(section.number).padStart(2, "0")}</span><h2>{section.title}</h2><Badge accent={done === all.length ? "green" : "slate"}>{done}/{all.length}</Badge><ChevronDown size={18} className={open ? "franchise-chevron-open" : ""} /></button>{open && <div id={`franchise-section-${section.number}`} className="franchise-section__tasks">{section.groups.map((group, index) => <div key={index}>{group.title && <h3>{group.title}</h3>}{template.filter((task) => task.group === (group.title ?? "") && (headingMatch || match(task.task))).map((task) => row(stateFor(task.key, task.phase, task.task)))}</div>)}{additional.filter((task) => headingMatch || match(task.task)).map(row)}</div>}</section>;
      })}</div>{!!unmatched.length && <section className="franchise-section"><div className="franchise-section__heading"><h2>Additional saved launch tasks</h2><Badge>{unmatched.length}</Badge></div><div className="franchise-section__tasks">{unmatched.map(row)}</div></section>}
    </>}
    {adding && <AddFranchiseTask onClose={() => setAdding(false)} onSaved={(task) => { updateTask(task); setAdding(false); setNotice("Additional launch task saved."); const section = FRANCHISE_SECTIONS.find((section) => section.title === task.phase); if (section) setExpanded([...expanded, section.number]); }} />}
  </div>;
}

function AddFranchiseTask({ onClose, onSaved }: { onClose: () => void; onSaved: (task: FranchiseTaskState) => void }) {
  const [phase, setPhase] = useState(FRANCHISE_SECTIONS[0].title);
  const [task, setTask] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    try { const result = await fetchJson<{ task: FranchiseTaskState }>("/api/btb/franchise-checklist", jsonRequest({ action: "add", phase, task })); onSaved(result.task); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title="Add a launch task" description="Add the location-specific details your team needs." busy={saving} onClose={onClose}><form onSubmit={submit}>{error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}<fieldset className="ui-form-stack" disabled={saving}><label>Section<select className="ui-input" value={phase} onChange={(event) => setPhase(event.target.value)}>{FRANCHISE_SECTIONS.map((section) => <option key={section.number} value={section.title}>{section.number}. {section.title}</option>)}</select></label><label>Task<Input data-modal-autofocus value={task} onChange={(event) => setTask(event.target.value)} required maxLength={500} /></label></fieldset><div className="ui-modal__actions"><Button disabled={saving} variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving…" : "Add task"}</Button></div></form></Modal>;
}
