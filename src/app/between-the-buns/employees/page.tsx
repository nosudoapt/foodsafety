"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Pencil, Phone, Search, UserPlus, UsersRound } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { EMPLOYEE_ROLES, employeeEditableBy, type BtbEmployee, type EmployeeRole } from "@/lib/btb-team";
import { BTB_ROLE_LABELS } from "@/lib/btb-roles";

export default function EmployeesPage() {
  return <BtbFeatureGate feature="employees">{(readOnly) => <Employees readOnly={readOnly} />}</BtbFeatureGate>;
}

function Employees({ readOnly }: { readOnly: boolean }) {
  const { identity, reload: reloadIdentity } = useBtbWorkspace();
  const { data, loading, error, reload, update } = useBtbData<{ employees: BtbEmployee[] }>("/api/btb/employees");
  const [query, setQuery] = useState("");
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<BtbEmployee | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const employees = data?.employees ?? [];
  const visible = employees.filter((employee) => (inactive || employee.active) && `${employee.name} ${employee.email} ${employee.phone} ${employee.position}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="ops-workspace">
    <PageHeader title="Employees" subtitle="A named account for every teammate. Keep contact details, access and schedules together." action={!readOnly && <Button disabled={!data} onClick={() => setEditing("new")}><UserPlus size={18} aria-hidden="true" />Add employee</Button>} />
    <div className="ui-notice"><UsersRound size={20} aria-hidden="true" /><div><strong>Set up once. Sign in individually.</strong><p>Create an employee with their name, phone and email, then give them their initial password. They can change it in My account.</p></div></div>
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    <div className="ops-toolbar"><label className="dash-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search employees</span><input type="search" placeholder="Name, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="ops-checkbox"><input type="checkbox" checked={inactive} onChange={(event) => setInactive(event.target.checked)} />Include inactive employees</label><Link href="/between-the-buns/staff-schedule" className="ops-text-link">Weekly schedule</Link></div>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && <><p className="ops-meta">{employees.filter((employee) => employee.active).length} active employees · {employees.filter((employee) => employee.active && employee.login_enabled).length} individual logins enabled</p><div className="ops-employee-grid">{visible.map((employee) => <Card key={employee.id} className="ops-employee-card">
      <div className="ops-card-heading"><div className="ops-avatar" aria-hidden="true">{employee.name.split(/\s+/).slice(0, 2).map((name) => name[0]).join("")}</div><div><h2>{employee.name}</h2><p>{employee.position || BTB_ROLE_LABELS[employee.role]}</p></div>{!readOnly && identity && employeeEditableBy(identity.role, employee.role) && <button className="ui-iconbutton" aria-label={`Edit ${employee.name}`} onClick={() => setEditing(employee)}><Pencil size={17} /></button>}</div>
      <div className="ui-actions"><Badge accent={employee.active ? "purple" : "slate"}>{employee.active ? BTB_ROLE_LABELS[employee.role] : "Inactive"}</Badge><Badge accent={employee.login_enabled ? "green" : "amber"}>{employee.login_enabled ? "Individual login" : "Needs account setup"}</Badge></div>
      <a className="ops-contact" href={employee.email ? `mailto:${employee.email}` : undefined}><Mail size={16} aria-hidden="true" />{employee.email || "Email needed"}</a><a className="ops-contact" href={employee.phone ? `tel:${employee.phone.replace(/[^+\d]/g, "")}` : undefined}><Phone size={16} aria-hidden="true" />{employee.phone || "Phone needed"}</a>
    </Card>)}</div>{!visible.length && <div className="ui-empty"><UsersRound size={28} /><h2>{query ? "No matching teammates" : "Build your team"}</h2><p>{query ? "Try a different name, email or phone number." : "Add the first employee to enable individual sign-in, shift assignments and training progress."}</p></div>}</>}
    {editing && <EmployeeForm key={editing === "new" ? "new" : editing.id} employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(employee) => {
      update((current) => ({ employees: [...current.employees.filter((item) => item.id !== employee.id), employee].sort((a, b) => a.name.localeCompare(b.name)) }));
      setEditing(null); setNotice(`${employee.name}’s employee record is saved.`);
      if (employee.id === identity?.employeeId) reloadIdentity();
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
      <label>Workspace role<select className="ui-input" disabled={self} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as EmployeeRole })}>{EMPLOYEE_ROLES.filter((role) => identity && employeeEditableBy(identity.role, role)).map((role) => <option key={role} value={role}>{BTB_ROLE_LABELS[role]}</option>)}</select><small>{identity?.role === "supervisor" ? "Supervisors manage staff accounts. Managers manage leadership accounts." : "The role determines which tools this employee can use."}</small></label>
      <label>{employee?.login_enabled ? "Reset password" : "Initial password"} <span>{employee?.login_enabled ? "optional" : "10–128 characters"}</span><Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required={!employee?.login_enabled} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>{employee?.login_enabled ? "Leave blank to keep the current password. A reset signs out their other sessions." : "Share this password directly with the employee. It cannot be viewed after saving."}</small></label>
      <label className="ops-checkbox"><input type="checkbox" disabled={self} checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Active employee</label>
      {self && <small>Another manager can change your own role or active status.</small>}
    </fieldset><div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save employee"}</Button></div>
  </form></Modal>;
}
