"use client";

import { useState } from "react";
import { AlertTriangle, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";

/**
 * Compliance & expiry: private certificates with confirmed expiry dates,
 * 60/30-day countdowns, and the renewal history. Uploading a file alone never
 * renews: the SQL boundary demands an explicitly confirmed expiry date, and a
 * dated renewal or correction demands a reason.
 */

export interface ComplianceDocument {
  id: string;
  doc_type: string;
  name: string;
  employee_id: string | null;
  responsible_id: string | null;
  licence_number: string | null;
  recipients: string[] | null;
  file_id: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  version: number;
}

export interface ComplianceVersion {
  document_id: string;
  version: number;
  file_id: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  confirmed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface ComplianceData {
  location_id: string;
  documents: ComplianceDocument[];
  history: ComplianceVersion[];
  team: { id: string; name: string }[];
  required_types: string[] | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function daysUntil(expiry: string | null): number | null {
  if (!expiry) return null;
  const days = Math.round((Date.parse(`${expiry}T12:00:00Z`) - Date.parse(`${todayIso()}T12:00:00Z`)) / 86_400_000);
  return Number.isFinite(days) ? days : null;
}

export default function CompliancePanel({ locationId, data, loading, error, reload }: {
  locationId: string;
  data: ComplianceData | null;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [editing, setEditing] = useState<ComplianceDocument | null>(null);
  const [draftReason, setDraftReason] = useState("");

  function startNew() {
    setEditing({ id: "", doc_type: data?.required_types?.[0] ?? "", name: "", employee_id: "", responsible_id: "", licence_number: "", recipients: [], file_id: null, issue_date: null, expiry_date: null, notes: "", version: 0 });
  }

  async function save(form: {
    id: string;
    doc_type: string;
    name: string;
    employee_id: string;
    licence_number: string;
    issue_date: string;
    expiry_date: string;
    expiry_confirmed: boolean;
    file_id: string | null;
    notes: string;
    reason: string;
    version: number;
  }) {
    setBusy(form.id || "new"); setNotice(null);
    try {
      await fetchJson("/api/btb/platform/compliance", jsonRequest({
        location_id: locationId,
        doc: {
          id: form.id || null,
          doc_type: form.doc_type,
          name: form.name,
          employee_id: form.employee_id || null,
          licence_number: form.licence_number || null,
          issue_date: form.issue_date || null,
          expiry_date: form.expiry_date || null,
          expiry_confirmed: form.expiry_confirmed,
          file_id: form.file_id,
          notes: form.notes || null,
          reason: form.reason || null,
          version: form.version,
        },
      }));
      setEditing(null); setDraftReason("");
      setNotice({ tone: "ok", text: "Certificate saved with an explicitly confirmed expiry." });
      reload();
    } catch (cause) {
      setNotice({ tone: "bad", text: messageOf(cause) });
    } finally {
      setBusy("");
    }
  }

  return <>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {notice && <div className={`ui-notice ${notice.tone === "ok" ? "ui-notice--success" : "ui-notice--warning"}`} role="alert">
      {notice.tone === "ok" ? <ShieldCheck size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
      <span>{notice.text}</span>
    </div>}
    {data && <>
      <Card><div className="ops-panel" aria-label="Certificate register">
        <div className="ops-toolbar">
          <div>
            <h2 className="ops-section-title">Certificate register</h2>
            <p className="ops-meta">Private, per location. Files are only marked renewed when the expiry date is explicitly confirmed by a person.</p>
          </div>
          <div className="ops-toolbar-actions">
            <Button variant="ghost" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>
            <Button variant="soft" onClick={startNew}>Register a certificate</Button>
          </div>
        </div>
        {!data.documents.length && <p className="ui-empty">No certificates recorded for this location yet.</p>}
        <table className="ui-table">
          <caption>Compliance certificates</caption>
          <thead><tr><th scope="col">Certificate</th><th scope="col">Holder</th><th scope="col">Expiry</th><th scope="col">Countdown</th><th scope="col">File</th><th scope="col">Version</th><th scope="col" /></tr></thead>
          <tbody>
            {data.documents.map((doc) => {
              const days = daysUntil(doc.expiry_date);
              return <tr key={doc.id}>
                <td><p className="ui-row-title">{doc.name}</p><p className="ops-meta">{doc.doc_type}{doc.licence_number ? ` · ${doc.licence_number}` : ""}</p></td>
                <td className="ops-meta">{data.team.find((member) => member.id === doc.employee_id)?.name ?? "Location"}</td>
                <td className="ops-meta">{doc.expiry_date ?? "Not recorded"}</td>
                <td><ExpiryBadge days={days} /></td>
                <td>{doc.file_id
                  ? <a href={`/api/btb/platform/file/${doc.file_id}?download=1`} className="ops-link"><Download size={14} aria-hidden="true" /> Download</a>
                  : <span className="ops-meta">None</span>}</td>
                <td className="ops-meta">v{doc.version}</td>
                <td><Button variant="ghost" onClick={() => { setEditing(doc); setDraftReason(""); }}>Update</Button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div></Card>

      <Card><div className="ops-panel" aria-label="Renewal history">
        <h2 className="ops-section-title">Renewal history</h2>
        {!data.history.length && <p className="ui-empty">No revisions recorded yet.</p>}
        <ul className="ui-list">
          {data.history.slice(0, 40).map((entry) => <li key={`${entry.document_id}:${entry.version}`} className="ui-list-row">
            <Badge accent="purple">v{entry.version}</Badge>
            <div>
              <p className="ui-row-title">{entry.expiry_date ? `Confirmed expiry ${entry.expiry_date}` : "Details corrected"}</p>
              <p className="ops-meta">{entry.confirmed_by_name ?? "Team"} · {new Date(entry.created_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}{entry.reason ? ` · ${entry.reason}` : ""}</p>
            </div>
          </li>)}
        </ul>
      </div></Card>

      {editing && <DocumentForm
        document={editing}
        locationId={locationId}
        types={data.required_types ?? []}
        team={data.team}
        busy={busy === (editing.id || "new")}
        reason={draftReason}
        onReason={setDraftReason}
        onClose={() => setEditing(null)}
        onSave={save}
      />}
    </>}
  </>;
}

function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return <Badge accent="amber">No expiry</Badge>;
  if (days <= 30) return <Badge accent="red">{days} days · renew now</Badge>;
  if (days <= 60) return <Badge accent="amber">{days} days · plan renewal</Badge>;
  return <Badge accent="green">{days} days</Badge>;
}

function DocumentForm({ document, locationId, types, team, busy, reason, onReason, onClose, onSave }: {
  document: ComplianceDocument;
  locationId: string;
  types: string[];
  team: { id: string; name: string }[];
  busy: boolean;
  reason: string;
  onReason: (value: string) => void;
  onClose: () => void;
  onSave: (form: {
    id: string;
    doc_type: string;
    name: string;
    employee_id: string;
    licence_number: string;
    issue_date: string;
    expiry_date: string;
    expiry_confirmed: boolean;
    file_id: string | null;
    notes: string;
    reason: string;
    version: number;
  }) => Promise<void>;
}) {
  const isNew = !document.id;
  const [docType, setDocType] = useState(document.doc_type || types[0] || "Other");
  const [name, setName] = useState(document.name);
  const [holder, setHolder] = useState(document.employee_id ?? "");
  const [licence, setLicence] = useState(document.licence_number ?? "");
  const [issue, setIssue] = useState(document.issue_date ?? "");
  const [expiry, setExpiry] = useState(document.expiry_date ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [fileId, setFileId] = useState(document.file_id);
  const [fileName, setFileName] = useState("");
  const [notes, setNotes] = useState(document.notes ?? "");
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string>("");

  async function choose(file: File | null) {
    if (!file) return;
    setUploading(true); setFailure("");
    try {
      const buffer = await file.arrayBuffer();
      const content = Buffer.from(buffer).toString("base64");
      const saved = await fetchJson<{ file: { id: string; name: string } }>("/api/btb/platform/file", jsonRequest({
        location_id: locationId,
        purpose: "compliance",
        name: file.name,
        mime: file.type || "application/pdf",
        content_base64: content,
      }));
      setFileId(saved.file.id);
      setFileName(saved.file.name);
    } catch (cause) {
      setFailure(messageOf(cause));
    } finally {
      setUploading(false);
    }
  }

  const expiryChanged = expiry !== "" && expiry !== document.expiry_date;
  const canSave = name.trim().length >= 2 && (!expiryChanged || confirmed) && (isNew || reason.trim().length >= 3);

  return <Card><div className="ops-panel" aria-label="Certificate form">
    <h2 className="ops-section-title">{isNew ? "Register a certificate" : `Update v${document.version}`}</h2>
    <form className="ops-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canSave) return;
      void onSave({
        id: document.id,
        doc_type: docType,
        name: name.trim(),
        employee_id: holder,
        licence_number: licence.trim(),
        issue_date: issue,
        expiry_date: expiry,
        expiry_confirmed: confirmed || (!expiryChanged && expiry !== ""),
        file_id: fileId,
        notes: notes.trim(),
        reason: reason.trim(),
        version: document.version,
      });
    }}>
      <table className="ui-table ops-form-grid"><tbody>
        <tr><th scope="row">Type</th><td>
          <select className="ui-input" value={docType} onChange={(event) => setDocType(event.target.value)}>
            {(types.length ? types : [docType || "Other"]).map((option) => <option key={option} value={option}>{option}</option>)}
            {docType && !types.includes(docType) && <option value={docType}>{docType}</option>}
          </select>
        </td></tr>
        <tr><th scope="row">Name</th><td><Input value={name} maxLength={200} placeholder="e.g. Food Handler - Priya S." onChange={(event) => setName(event.target.value)} /></td></tr>
        <tr><th scope="row">Holder</th><td>
          <select className="ui-input" value={holder} onChange={(event) => setHolder(event.target.value)}>
            <option value="">Location-wide</option>
            {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </td></tr>
        <tr><th scope="row">Licence number</th><td><Input value={licence} maxLength={80} onChange={(event) => setLicence(event.target.value)} /></td></tr>
        <tr><th scope="row">Issue date</th><td><Input type="date" value={issue} onChange={(event) => setIssue(event.target.value)} /></td></tr>
        <tr><th scope="row">Expiry date</th><td><Input type="date" value={expiry} onChange={(event) => { setExpiry(event.target.value); setConfirmed(false); }} /></td></tr>
        <tr><th scope="row">Confirm</th><td>
          <label className="ops-inline-field">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>I have checked the physical certificate: expiry is correct</span>
          </label>
        </td></tr>
        <tr><th scope="row">Certificate file</th><td>
          <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => void choose(event.target.files?.[0] ?? null)} />
          {uploading && <p className="ops-meta">Uploading…</p>}
          {fileName && <p className="ops-meta"><Download size={12} aria-hidden="true" /> {fileName}</p>}
        </td></tr>
        <tr><th scope="row">Notes</th><td><Input value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} /></td></tr>
        {!isNew && <tr><th scope="row">Reason</th><td><Input value={reason} maxLength={500} placeholder="Required: e.g. renewed certificate for 2027" onChange={(event) => onReason(event.target.value)} /></td></tr>}
      </tbody></table>
      {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
      <div className="ops-toolbar-actions">
        <Button type="submit" variant="soft" disabled={busy || uploading || !canSave}>Save certificate</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
      <p className="ops-meta">Saving is declined unless the expiry is explicitly confirmed; every revision is versioned with your reason.</p>
    </form>
  </div></Card>;
}
