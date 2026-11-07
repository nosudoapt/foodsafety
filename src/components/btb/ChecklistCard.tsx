"use client";

import { useMemo, useState } from "react";
import { Check, Moon, Paperclip, Save, Sparkles, Sun, X } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";
import type { PlatformCheckKind } from "@/lib/btb-platform";

export interface PlatformTask {
  id: string;
  text: string;
  section?: string;
  requires_photo?: boolean;
  requires_value?: boolean;
  assigned_to?: string | null;
  completed?: boolean;
  completed_by_name?: string | null;
  completed_at?: string | null;
  value?: string | null;
  notes?: string | null;
  evidence_id?: string | null;
}

export interface PlatformCheck {
  id: string;
  check_date: string;
  check_type: PlatformCheckKind;
  items: PlatformTask[];
  done_count: number;
  total_count: number;
  completed: boolean;
  notes: string;
  saved_by_name: string | null;
  updated_at: string;
  version: number;
}

interface Row {
  completed: boolean;
  value: string;
  notes: string;
  evidence_id: string | null;
  evidence_name: string;
}

const title = (kind: PlatformCheckKind) =>
  kind === "opening" ? "Opening" : kind === "closing" ? "Closing" : "Cleaning";
const blurb = (kind: PlatformCheckKind) =>
  kind === "opening" ? "Ready for the first guest" : kind === "closing" ? "Ready for tomorrow" : "Clean for the next shift";

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("The file could not be read. Choose it again and retry."));
  reader.onload = () => {
    const result = String(reader.result ?? "");
    const comma = result.indexOf(",");
    if (comma < 0) reject(new Error("The file could not be read. Choose it again and retry."));
    else resolve(result.slice(comma + 1));
  };
  reader.readAsDataURL(file);
});

export async function uploadEvidence(locationId: string, file: File) {
  const content = await readFile(file);
  const result = await fetchJson<{ file: { id: string } }>("/api/btb/platform/file", jsonRequest({
    location_id: locationId,
    purpose: "evidence",
    name: file.name,
    mime: file.type,
    content_base64: content,
  }));
  return result.file.id;
}

export default function ChecklistCard({ kind, date, check, template, locationId, readOnly, onSaved }: {
  kind: PlatformCheckKind;
  date: string;
  check?: PlatformCheck;
  template: PlatformTask[];
  locationId: string;
  readOnly: boolean;
  onSaved: (check: PlatformCheck) => void;
}) {
  const tasks = useMemo(() => (check?.items?.length ? check.items : template), [check, template]);
  // The parent remounts this card (via a key) after each save, so initial state
  // seeds straight from the saved record without a setState effect.
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(tasks.map((task) => [task.id, {
    completed: task.completed === true,
    value: task.value ?? "",
    notes: task.notes ?? "",
    evidence_id: task.evidence_id ?? null,
    evidence_name: "",
  }])));
  const [notes, setNotes] = useState(check?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const done = tasks.filter((task) => rows[task.id]?.completed).length;
  const set = (id: string, patch: Partial<Row>) =>
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const attach = async (id: string, file: File | undefined) => {
    if (!file) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const fileId = await uploadEvidence(locationId, file);
      set(id, { evidence_id: fileId, evidence_name: file.name });
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };

  const save = async () => {
    if (saving || readOnly) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await fetchJson<{ check: PlatformCheck }>("/api/btb/platform/check", jsonRequest({
        location_id: locationId,
        date: check?.check_date ?? date,
        kind,
        version: check?.version ?? 0,
        notes,
        changes: tasks.map((task) => ({
          id: task.id,
          completed: rows[task.id]?.completed === true,
          value: rows[task.id]?.value || null,
          notes: rows[task.id]?.notes || null,
          evidence_id: rows[task.id]?.evidence_id ?? null,
        })),
      }));
      onSaved(result.check);
      setNotice(`${title(kind)} checklist saved under your name.`);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };

  return <section className="btb-check-card" aria-label={`${title(kind)} checklist`}>
    <header className="btb-check-card__head">
      <div className="ops-card-heading">
        <span className={`ui-icon ui-tone--${kind === "opening" ? "amber" : kind === "closing" ? "purple" : "teal"}`}>
          {kind === "opening" ? <Sun size={20} aria-hidden="true" /> : kind === "closing" ? <Moon size={20} aria-hidden="true" /> : <Sparkles size={20} aria-hidden="true" />}
        </span>
        <div><h2>{title(kind)}</h2><p>{blurb(kind)}</p></div>
        <Badge accent={done === tasks.length ? "green" : "slate"}>{done}/{tasks.length}</Badge>
      </div>
      <progress className="ops-progress" value={done} max={tasks.length || 1} aria-label={`${title(kind)} progress`} />
      <p className="ops-meta">
        {tasks.length === 0 ? "A manager has not configured this checklist yet." : check ? `Last saved by ${check.saved_by_name ?? "an employee"}` : "No checks saved yet"}
      </p>
    </header>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {tasks.map((task) => {
      const row = rows[task.id] ?? { completed: false, value: "", notes: "", evidence_id: null, evidence_name: "" };
      return <div className="ops-task" key={task.id}>
        <label className="ops-checkbox">
          <input type="checkbox" checked={row.completed} disabled={readOnly || saving} onChange={(event) => set(task.id, { completed: event.target.checked })} />
          <span>{task.text}</span>
        </label>
        {task.requires_value && <Input placeholder="Recorded value" value={row.value} disabled={readOnly || saving} onChange={(event) => set(task.id, { value: event.target.value })} aria-label={`${task.text} value`} />}
        {row.completed && task.completed_by_name && <p className="ops-meta"><Check size={12} aria-hidden="true" /> {task.completed_by_name}</p>}
        {task.requires_photo && <div className="ops-evidence">
          {row.evidence_id ? <Badge accent="green"><Paperclip size={12} aria-hidden="true" /> {row.evidence_name || "Evidence attached"}</Badge> : <span className="ops-meta">Photo evidence required</span>}
          <label className="ui-button ui-button--ghost ops-file">
            Attach photo
            <input type="file" accept="image/png,image/jpeg" hidden disabled={readOnly || saving} onChange={(event) => void attach(task.id, event.target.files?.[0])} />
          </label>
          {row.evidence_id && <Button variant="ghost" disabled={readOnly || saving} onClick={() => set(task.id, { evidence_id: null, evidence_name: "" })}><X size={14} aria-hidden="true" />Remove</Button>}
        </div>}
      </div>;
    })}
    <div className="btb-check-card__foot">
      <label>Handover notes
        <textarea className="ui-input" rows={2} maxLength={2000} value={notes} disabled={readOnly || saving} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the next shift should know" />
      </label>
      {!readOnly && <Button disabled={saving || tasks.length === 0} onClick={save}><Save size={16} aria-hidden="true" />{saving ? "Saving…" : "Save checklist"}</Button>}
    </div>
  </section>;
}
