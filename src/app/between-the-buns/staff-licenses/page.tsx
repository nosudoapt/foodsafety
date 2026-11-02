"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileBadge, Pencil, Plus, Search } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { STAFF_LICENCE_TYPES, daysUntilExpiry, licenceExpiryLabel, licenceTypeLabel, type StaffLicence } from "@/lib/btb-licences";
import { btbToday, type TeamMember } from "@/lib/btb-team";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import { fetchJson } from "@/lib/fetch-json";

type LicenceData = { licences: StaffLicence[]; employees: TeamMember[] };
export default function StaffLicencesPage() {
  return <BtbFeatureGate feature="staff_licenses">{(readOnly, role) => <Licences readOnly={readOnly} showReminders={role === "manager" || role === "corporate"} />}</BtbFeatureGate>;
}

function Licences({ readOnly, showReminders }: { readOnly: boolean; showReminders: boolean }) {
  const { data, loading, error, reload, update } = useBtbData<LicenceData>("/api/btb/staff-licences");
  const [editing, setEditing] = useState<StaffLicence | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [fileError, setFileError] = useState("");
  const [notice, setNotice] = useState("");
  const visible = data?.licences.filter((licence) => `${licence.staff_name} ${licenceTypeLabel(licence.license_type)}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const download = async (licence: StaffLicence) => {
    if (busy) return; setBusy(licence.id); setFileError("");
    try { const file = await fetchJson<{ url: string; name: string }>(`/api/btb/staff-licences?download=${licence.id}`); downloadDataUrl(file.url, file.name); }
    catch (cause) { setFileError(messageOf(cause)); }
    finally { setBusy(""); }
  };
  return <div className="ops-workspace"><PageHeader title="Staff licences & certificates" subtitle="Keep employee qualifications and renewal dates close at hand." action={!readOnly && <Button disabled={!data} onClick={() => setEditing("new")}><Plus size={18} />Add certificate</Button>} />
    <div className="ops-toolbar"><label className="dash-search"><Search size={17} /><span className="sr-only">Search staff certificates</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee or certificate" /></label>{showReminders && <Link className="ops-text-link" href="/between-the-buns/licence-reminders">Manager & corporate email reminders</Link>}</div>
    <LoadState loading={loading} error={error} onRetry={reload} />{fileError && <p className="ui-notice ui-notice--error" role="alert">{fileError}</p>}{notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    <div className="ops-employee-grid">{visible.map((licence) => { const days = licence.expiry_date ? daysUntilExpiry(licence.expiry_date, btbToday()) : null; return <Card className="licence-card" key={licence.id}><div className="ops-card-heading"><FileBadge size={24} /><div><h2>{licence.staff_name}</h2><p>{licenceTypeLabel(licence.license_type)}</p></div>{!readOnly && <button className="ui-iconbutton" aria-label={`Edit ${licence.staff_name} certificate`} onClick={() => setEditing(licence)}><Pencil size={17} /></button>}</div><Badge accent={days !== null && days < 0 ? "red" : days !== null && days <= 30 ? "amber" : "green"}>{licenceExpiryLabel(licence.expiry_date, btbToday())}</Badge><dl className="licence-dates"><div><dt>Issued</dt><dd>{licence.issue_date || "—"}</dd></div><div><dt>Expires</dt><dd>{licence.expiry_date || "—"}</dd></div></dl>{licence.notes && <p className="licence-notes">{licence.notes}</p>}{licence.file_name && <><p className="ops-meta">{licence.file_name} · {formatFileSize(licence.file_size)}</p><Button variant="ghost" disabled={!!busy} onClick={() => download(licence)}><Download size={16} />{busy === licence.id ? "Opening…" : "Download certificate"}</Button></>}</Card>; })}</div>
    {data && !visible.length && <div className="ui-empty"><FileBadge size={28} /><h2>{query ? "No matching certificates" : "Add your team’s first certificate"}</h2><p>Link an employee and add an expiry date to include the certificate in renewal reminders.</p></div>}
    {editing && data && <LicenceForm key={editing === "new" ? "new" : editing.id} licence={editing === "new" ? null : editing} employees={data.employees} onClose={() => setEditing(null)} onSaved={(licence) => { update((current) => ({ ...current, licences: [licence, ...current.licences.filter((item) => item.id !== licence.id)] })); setEditing(null); setNotice("Certificate saved. Its expiry date is available to the reminder service."); }} onDeleted={(id) => { update((current) => ({ ...current, licences: current.licences.filter((licence) => licence.id !== id) })); setEditing(null); setNotice("Certificate removed."); }} />}
  </div>;
}

function LicenceForm({ licence, employees, onClose, onSaved, onDeleted }: { licence: StaffLicence | null; employees: TeamMember[]; onClose: () => void; onSaved: (licence: StaffLicence) => void; onDeleted: (id: string) => void }) {
  const [form, setForm] = useState({ employee_id: licence?.employee_id ?? "", staff_name: licence?.staff_name ?? "", license_type: licence?.license_type ?? "food_handler", issue_date: licence?.issue_date ?? "", expiry_date: licence?.expiry_date ?? "", notes: licence?.notes ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return;
    if (file && file.size > 5 * 1024 * 1024) { setError("Choose a file under 5 MB."); return; }
    setSaving(true); setError("");
    try { const upload = file ? { name: file.name, url: await fileToDataUrl(file) } : null; const result = await fetchJson<{ licence: StaffLicence }>("/api/btb/staff-licences", jsonRequest({ ...form, employee_id: form.employee_id || null, file: upload, id: licence?.id ?? null, version: licence?.version ?? 0 })); onSaved(result.licence); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!licence || saving) return; setSaving(true); setError("");
    try { await fetchJson("/api/btb/staff-licences", jsonRequest({ id: licence.id, version: licence.version }, "DELETE")); onDeleted(licence.id); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title={licence ? "Edit certificate" : "Add staff certificate"} description="Record the expiry date to include this certificate in manager and corporate reminders." busy={saving} onClose={onClose}><form onSubmit={submit}>{error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}<fieldset className="ui-form-stack" disabled={saving}>
    <label>Link an employee<select className="ui-input" data-modal-autofocus value={form.employee_id} onChange={(event) => { const employee = employees.find((employee) => employee.id === event.target.value); setForm({ ...form, employee_id: event.target.value, staff_name: employee?.name ?? form.staff_name }); }}><option value="">Enter a name manually</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{!employee.active ? " (inactive)" : ""}</option>)}</select></label><label>Employee name<Input required maxLength={100} disabled={!!form.employee_id} value={form.staff_name} onChange={(event) => setForm({ ...form, staff_name: event.target.value })} /></label>
    <label>Certificate type<select className="ui-input" value={form.license_type} onChange={(event) => setForm({ ...form, license_type: event.target.value })}>{STAFF_LICENCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><div className="ops-form-grid"><label>Issue date<Input type="date" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} /></label><label>Expiry date<Input type="date" min={form.issue_date || undefined} value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} /></label></div>
    <label>{licence?.file_name ? "Replace attachment" : "Attach certificate"} <span>optional · PDF or image, up to 5 MB</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{licence?.file_name && <small>Current file: {licence.file_name}</small>}</label><label>Notes<textarea className="ui-input" rows={3} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
  </fieldset><div className="ui-modal__actions">{licence && <Button variant="danger" disabled={saving} onClick={remove}>Remove certificate</Button>}<Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving…" : "Save certificate"}</Button></div></form></Modal>;
}
