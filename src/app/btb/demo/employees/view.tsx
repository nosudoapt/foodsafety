"use client";
// Interactive view; page.tsx owns the request-time server gate.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Pencil, Phone, Search, Send, UserPlus, UsersRound } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { EMPLOYEE_ROLES, employeeEditableBy, type BtbEmployee, type EmployeeRole } from "@/lib/btb-team";
import { BTB_ROLE_LABELS } from "@/lib/btb-roles";
import type { BtbAssignedLocation } from "@/lib/btb-page-access";
import type { BtbInvitationReceipt } from "@/lib/btb-admin";

export default function EmployeesPage() {
  return <BtbFeatureGate feature="employees">{(readOnly) => <Employees readOnly={readOnly} />}</BtbFeatureGate>;
}

function Employees({ readOnly }: { readOnly: boolean }) {
  const { identity, access, reload: reloadIdentity } = useBtbWorkspace();
  const { data, loading, error, reload, update } = useBtbData<{ employees: BtbEmployee[] }>("/api/btb/employees");
  const [query, setQuery] = useState("");
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<BtbEmployee | "new" | null>(null);
  const [inviting, setInviting] = useState<BtbEmployee | "new" | null>(null);
  const [inviteReceipt, setInviteReceipt] = useState<(BtbInvitationReceipt & { name: string }) | null>(null);
  const [notice, setNotice] = useState("");
  const employees = data?.employees ?? [];
  // The branch page's "Invite teammate" / "Add manually" links land here with
  // ?invite=1 / ?add=1 so the right form opens on arrival.
  useEffect(() => {
    if (readOnly || !data) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action") ?? (params.get("invite") === "1" ? "invite" : params.get("add") === "1" ? "add" : "");
    if (!action) return;
    window.history.replaceState(null, "", window.location.pathname);
    // Deferred a tick so opening a form from the URL never cascades a render
    // inside this effect (and the query is already cleared if it re-runs).
    const timer = window.setTimeout(() => {
      if (action === "invite") { setInviteReceipt(null); setInviting("new"); }
      if (action === "add") setEditing("new");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [readOnly, data]);
  const visible = employees.filter((employee) => (inactive || employee.active) && `${employee.name} ${employee.email} ${employee.phone} ${employee.position}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="ops-workspace">
    <PageHeader title="Employees" subtitle="A named account for every teammate. Keep contact details, access and schedules together." action={!readOnly && <div className="ui-actions"><Button variant="ghost" disabled={!data} onClick={() => setEditing("new")}><UserPlus size={18} aria-hidden="true" />Add manually</Button><Button disabled={!data} onClick={() => { setInviteReceipt(null); setInviting("new"); }}><Send size={18} aria-hidden="true" />Invite teammate</Button></div>} />
    <div className="ui-notice"><UsersRound size={20} aria-hidden="true" /><div><strong>Set up once. Sign in individually.</strong><p>Invite a teammate by email and they choose their own password — or add them manually with a temporary password you share privately.</p></div></div>
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {inviteReceipt && <InvitationResult receipt={inviteReceipt} onDismiss={() => setInviteReceipt(null)} />}
    <div className="ops-toolbar"><label className="dash-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search employees</span><input type="search" placeholder="Name, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="ops-checkbox"><input type="checkbox" checked={inactive} onChange={(event) => setInactive(event.target.checked)} />Include inactive employees</label><Link href="/btb/demo/staff-schedule" className="ops-text-link">Weekly schedule</Link></div>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && <><p className="ops-meta">{employees.filter((employee) => employee.active).length} active employees · {employees.filter((employee) => employee.active && employee.login_enabled).length} individual logins enabled</p><div className="ops-employee-grid">{visible.map((employee) => <Card key={employee.id} className="ops-employee-card">
      <div className="ops-card-heading"><div className="ops-avatar" aria-hidden="true">{employee.name.split(/\s+/).slice(0, 2).map((name) => name[0]).join("")}</div><div><h2>{employee.name}</h2><p>{employee.position || BTB_ROLE_LABELS[employee.role]}</p></div>{!readOnly && identity && employeeEditableBy(identity.role, employee.role, identity.console === true) && <button className="ui-iconbutton" aria-label={`Edit ${employee.name}`} onClick={() => setEditing(employee)}><Pencil size={17} /></button>}</div>
      <div className="ui-actions"><Badge accent={employee.active ? "purple" : "slate"}>{employee.active ? BTB_ROLE_LABELS[employee.role] : "Inactive"}</Badge><Badge accent={employee.login_enabled ? "green" : "amber"}>{employee.login_enabled ? "Individual login" : "Needs account setup"}</Badge>{!readOnly && identity && employee.email && employeeEditableBy(identity.role, employee.role, identity.console === true) && <button className="ui-iconbutton" aria-label={`Send ${employee.name} a setup invite`} title="Send setup invite" onClick={() => { setInviteReceipt(null); setInviting(employee); }}><Send size={16} /></button>}</div>
      <a className="ops-contact" href={employee.email ? `mailto:${employee.email}` : undefined}><Mail size={16} aria-hidden="true" />{employee.email || "Email needed"}</a><a className="ops-contact" href={employee.phone ? `tel:${employee.phone.replace(/[^+\d]/g, "")}` : undefined}><Phone size={16} aria-hidden="true" />{employee.phone || "Phone needed"}</a>
    </Card>)}</div>{!visible.length && <div className="ui-empty"><UsersRound size={28} /><h2>{query ? "No matching teammates" : "Build your team"}</h2><p>{query ? "Try a different name, email or phone number." : "Add the first employee to enable individual sign-in, shift assignments and training progress."}</p></div>}</>}
    {editing && <EmployeeForm key={editing === "new" ? "new" : editing.id} employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(employee) => {
      update((current) => ({ employees: [...current.employees.filter((item) => item.id !== employee.id), employee].sort((a, b) => a.name.localeCompare(b.name)) }));
      setEditing(null); setNotice(`${employee.name}’s employee record is saved.`);
      if (employee.id === identity?.employeeId) reloadIdentity();
    }} />}
    {inviting && <InviteForm key={inviting === "new" ? "new" : inviting.id} employee={inviting === "new" ? null : inviting} locations={access?.locations ?? []} onClose={() => setInviting(null)} onInvited={(receipt, name) => {
      setInviting(null); setInviteReceipt({ ...receipt, name });
      const sent = receipt.manualLink ? "" : receipt.email_status === "accepted" ? ` ${name} was emailed a branded setup link.` : receipt.email_status === "failed" ? " The email could not be delivered yet." : "";
      setNotice(sent); reload();
    }} />}
  </div>;
}

function EmployeeForm({ employee, onClose, onSaved }: { employee: BtbEmployee | null; onClose: () => void; onSaved: (employee: BtbEmployee) => void }) {
  const { identity } = useBtbWorkspace();
  const [form, setForm] = useState({ name: employee?.name ?? "", phone: employee?.phone ?? "", email: employee?.email ?? "", position: employee?.position ?? "", role: employee?.role ?? "staff" as EmployeeRole, active: employee?.active ?? true, password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const self = employee?.id === identity?.employeeId;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try { const result = await fetchJson<{ employee: BtbEmployee }>("/api/btb/employees", jsonRequest({ ...form, id: employee?.id ?? null, version: employee?.version ?? 0 })); onSaved(result.employee); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title={employee ? "Edit employee" : "Add employee"} description="Use the employee’s own email address for their BTB login." busy={saving} onClose={onClose}><form onSubmit={submit}>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    <fieldset className="ui-form-stack" disabled={saving}>
      <label>Name<Input required maxLength={100} value={form.name} data-modal-autofocus onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>
      <div className="ops-form-grid"><label>Phone<Input type="tel" required maxLength={30} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Email<Input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label></div>
      <label>Position <span>optional</span><Input value={form.position} maxLength={100} placeholder="Kitchen, front counter…" onChange={(event) => setForm({ ...form, position: event.target.value })} /></label>
      <label>Workspace role<select className="ui-input" disabled={self} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as EmployeeRole })}>{EMPLOYEE_ROLES.filter((role) => identity && employeeEditableBy(identity.role, role, identity?.console === true)).map((role) => <option key={role} value={role}>{BTB_ROLE_LABELS[role]}</option>)}</select><small>{identity?.role === "supervisor" ? "Supervisors manage staff accounts. Managers manage leadership accounts." : "The role determines which tools this employee can use."}</small></label>
      <label>{employee?.login_enabled ? "Reset password" : "Initial password"} <span>{employee?.login_enabled ? "optional" : "10–128 characters"}</span><Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required={!employee?.login_enabled} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>{employee?.login_enabled ? "Leave blank to keep the current password. A reset signs out their other sessions." : "Share this password directly with the employee. It cannot be viewed after saving."}</small></label>
      <label className="ops-checkbox"><input type="checkbox" disabled={self} checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Active employee</label>
      {self && <small>Another manager can change your own role or active status.</small>}
    </fieldset><div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save employee"}</Button></div>
  </form></Modal>;
}

function InviteForm({ employee, locations, onClose, onInvited }: { employee: BtbEmployee | null; locations: BtbAssignedLocation[]; onClose: () => void; onInvited: (receipt: BtbInvitationReceipt, name: string) => void }) {
  const { identity } = useBtbWorkspace();
  const active = locations.filter((site) => site.active);
  const [form, setForm] = useState({ name: employee?.name ?? "", email: employee?.email ?? "", role: employee?.role ?? "staff" as EmployeeRole });
  const [locationId, setLocationId] = useState(active[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError("");
    try {
      const receipt = await fetchJson<BtbInvitationReceipt>("/api/btb/employees/invite", jsonRequest(employee
        ? { locationId, employeeId: employee.id }
        : { locationId, name: form.name, email: form.email, role: form.role }));
      onInvited(receipt, employee?.name ?? form.name);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title={employee ? `Invite ${employee.name}` : "Invite a teammate"} description="They receive a branded email, choose their own password, then sign in with their role’s access." busy={saving} onClose={onClose}><form onSubmit={submit}>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    <fieldset className="ui-form-stack" disabled={saving}>
      {!employee && <>
        <label>Name<Input required maxLength={100} data-modal-autofocus value={form.name} autoComplete="name" onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Email<Input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Workspace role<select className="ui-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as EmployeeRole })}>{EMPLOYEE_ROLES.filter((role) => identity && employeeEditableBy(identity.role, role, identity?.console === true)).map((role) => <option key={role} value={role}>{BTB_ROLE_LABELS[role]}</option>)}</select><small>The role decides which tools they can use. You can only invite roles you manage.</small></label>
      </>}
      {employee && <p className="ui-notice">Sending a new invitation to <strong>{employee.email}</strong> replaces every unused setup link for {employee.name}.</p>}
      {active.length > 1 && <label>Location<select className="ui-input" value={locationId} onChange={(event) => setLocationId(event.target.value)}>{active.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>}
      {!active.length && <p className="ui-notice ui-notice--error" role="alert">You are not assigned to an active location. Ask the console to activate one.</p>}
    </fieldset>
    <div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !locationId}>{saving ? "Sending invitation…" : "Send invite"}</Button></div>
  </form></Modal>;
}

function InvitationResult({ receipt, onDismiss }: { receipt: BtbInvitationReceipt & { name: string }; onDismiss: () => void }) {
  const [copied, setCopied] = useState("");
  const heading = receipt.manualLink ? "Invitation ready · manual link"
    : receipt.email_status === "accepted" ? `Invitation sent to ${receipt.name}`
      : receipt.email_status === "failed" ? "Invitation created · email failed" : "Invitation queued";
  const message = receipt.manualLink ? "Email is unavailable. Copy this private link and send it to the teammate yourself."
    : receipt.email_status === "accepted" ? "The branded setup email was accepted by the email provider."
      : receipt.email_status === "failed" ? `The setup email could not be delivered${receipt.email_error ? ` — ${receipt.email_error}` : ""}. The daily outbox will retry, or send a new invite.`
        : "The daily email worker will send the setup link.";
  async function copy() {
    try { await navigator.clipboard.writeText(receipt.manualLink!); setCopied("Link copied. Share it privately."); }
    catch { setCopied("Copy wasn’t available. Select the link and copy it manually."); }
  }
  return <Card><div className="ui-actions" style={{ justifyContent: "space-between" }}><strong>{heading}</strong><Button variant="ghost" onClick={onDismiss}>Dismiss</Button></div><p>{message}</p><p className="hint">Single use · expires {new Date(receipt.expires_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}.</p>{receipt.manualLink && <><label className="ui-form-stack">Private setup link<Input readOnly value={receipt.manualLink} onFocus={(event) => event.target.select()} /></label><Button variant="ghost" onClick={copy}>Copy link</Button>{copied && <p role="status">{copied}</p>}</>}</Card>;
}
