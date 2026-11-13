"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, Moon, Pencil, Sun } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Input, PageHeader } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import OnePagePrint, { PrintSheetButton } from "@/components/btb/OnePagePrint";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { btbToday, isIsoDate, type TeamMember } from "@/lib/btb-team";
import { SHIFT_DUTIES, dutyNames, type BtbShift, type ShiftDuty } from "@/lib/btb-operations";
import { addDays, dayLabel, weekDays, weekStart } from "@/lib/staff-schedule";

type ScheduleData = { employees: TeamMember[]; shifts: BtbShift[] };
const dutyLabel = (duty: ShiftDuty) => SHIFT_DUTIES.find((item) => item.value === duty)?.label ?? duty;
const timeLabel = (shift: BtbShift) => `${shift.start_time}–${shift.end_time}${shift.ends_next_day ? " (+1 day)" : ""}`;

export default function StaffSchedulePage() {
  return <BtbFeatureGate feature="staff_schedule" wide>{(readOnly) => <Schedule readOnly={readOnly} />}</BtbFeatureGate>;
}

function Schedule({ readOnly }: { readOnly: boolean }) {
  const [start, setStart] = useState(() => weekStart(btbToday()));
  return <div className="ops-workspace"><div className="btb-screen"><PageHeader title="Staff schedule" subtitle="A clear week, from the opening team to the last close." />
    <div className="ops-toolbar"><div className="ui-actions"><Button variant="ghost" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={18} /></Button><label className="ops-inline-field">Week of<Input type="date" value={start} onChange={(event) => { if (isIsoDate(event.target.value)) setStart(weekStart(event.target.value)); }} /></label><Button variant="ghost" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={18} /></Button><Button variant="soft" onClick={() => setStart(weekStart(btbToday()))}>This week</Button></div>{!readOnly && <Link className="ops-text-link" href="/between-the-buns/employees">Manage employees</Link>}</div>
  </div><ScheduleWeek key={start} start={start} readOnly={readOnly} /></div>;
}

function ScheduleWeek({ start, readOnly }: { start: string; readOnly: boolean }) {
  const { identity } = useBtbWorkspace();
  const { data, loading, error, reload, update } = useBtbData<ScheduleData>(`/api/btb/staff-schedule?start=${start}`);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [editing, setEditing] = useState<BtbShift | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const days = weekDays(start);
  const shifts = data?.shifts ?? [];
  const employees = data?.employees ?? [];
  const active = employees.filter((employee) => employee.active);
  const name = (id: string) => employees.find((employee) => employee.id === id)?.name ?? "Former employee";
  const byDay = (day: string) => shifts.filter((shift) => shift.shift_date === day).sort((a, b) => a.start_time.localeCompare(b.start_time) || name(a.employee_id).localeCompare(name(b.employee_id)));
  return <>
    <div className="btb-screen ops-workspace"><div className="ops-toolbar"><label className="ops-inline-field">View<select className="ui-input" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="">Everyone</option>{employees.filter((employee) => employee.active || shifts.some((shift) => shift.employee_id === employee.id)).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.id === identity?.employeeId ? " (me)" : ""}</option>)}</select></label><div className="ui-actions"><PrintSheetButton disabled={!data} label="Print weekly schedule" />{!readOnly && <Button disabled={!data || !active.length} onClick={() => setEditing("new")}><CalendarPlus size={18} />Add shift</Button>}</div></div>
      {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      <LoadState loading={loading} error={error} onRetry={reload} />
      {data && <><p className="ops-meta">{start} – {addDays(start, 6)} · {shifts.length} shifts · Opening and closing coverage always shows the whole team.</p>
        {!active.length && <div className="ui-notice">{readOnly ? "The team roster is being set up." : <span>Add employees before creating shifts. <Link href="/between-the-buns/employees" className="ops-text-link">Open employee records</Link></span>}</div>}
        <div className="schedule-week">{days.map((day) => {
          const daily = byDay(day);
          const opening = dutyNames(daily, employees, "opening");
          const closing = dutyNames(daily, employees, "closing");
          const visible = daily.filter((shift) => !employeeFilter || shift.employee_id === employeeFilter);
          return <section className={`schedule-day ${day === btbToday() ? "schedule-day--today" : ""}`} key={day} aria-label={dayLabel(day)}>
            <header><h2>{dayLabel(day)}</h2>{day === btbToday() && <Badge accent="purple">Today</Badge>}</header>
            <div className="schedule-coverage"><p><Sun size={14} aria-hidden="true" /><span><strong>Opening</strong>{opening.join(", ") || "Unassigned"}</span></p><p><Moon size={14} aria-hidden="true" /><span><strong>Closing</strong>{closing.join(", ") || "Unassigned"}</span></p></div>
            <div className="schedule-shifts">{visible.map((shift) => <article className="schedule-shift" key={shift.id}><div><h3>{name(shift.employee_id)}</h3><p>{timeLabel(shift)}</p><Badge accent={shift.duty === "service" ? "slate" : "purple"}>{dutyLabel(shift.duty)}</Badge></div>{!readOnly && <button className="ui-iconbutton" aria-label={`Edit ${name(shift.employee_id)} on ${day}`} onClick={() => setEditing(shift)}><Pencil size={15} /></button>}</article>)}{!visible.length && <p className="ops-meta schedule-empty">{employeeFilter ? "No shift" : "No shifts yet"}</p>}</div>
          </section>;
        })}</div>
      </>}
      {editing && data && <ShiftForm key={editing === "new" ? "new" : editing.id} shift={editing === "new" ? null : editing} start={start} employees={employees} onClose={() => setEditing(null)} onSaved={(shift) => { update((current) => ({ ...current, shifts: [...current.shifts.filter((item) => item.id !== shift.id), shift] })); setEditing(null); setNotice("Shift saved. The weekly schedule is up to date."); }} onDeleted={(id) => { update((current) => ({ ...current, shifts: current.shifts.filter((shift) => shift.id !== id) })); setEditing(null); setNotice("Shift removed."); }} />}
    </div>
    {data && <OnePagePrint landscape label="Weekly schedule print sheet"><header className="ops-print-heading"><div><h1>Between the Buns · Weekly schedule</h1><p>{start} – {addDays(start, 6)}</p></div><span>{shifts.length} shifts · All employees</span></header><table className="schedule-print-table"><thead><tr><th scope="col">Team / coverage</th>{days.map((day) => <th scope="col" key={day}>{dayLabel(day)}</th>)}</tr></thead><tbody>
      {(["opening", "closing"] as const).map((duty) => <tr key={duty}><th scope="row">{duty === "opening" ? "Opening staff" : "Closing staff"}</th>{days.map((day) => <td key={day}>{dutyNames(byDay(day), employees, duty).join(", ") || "Unassigned"}</td>)}</tr>)}
      {employees.filter((employee) => shifts.some((shift) => shift.employee_id === employee.id)).map((employee) => <tr key={employee.id}><th scope="row">{employee.name}</th>{days.map((day) => <td key={day}>{byDay(day).filter((shift) => shift.employee_id === employee.id).map((shift) => <div key={shift.id}>{timeLabel(shift)}<br /><strong>{dutyLabel(shift.duty)}</strong></div>)}</td>)}</tr>)}
    </tbody></table><p className="ops-print-footer">Times use the restaurant’s local time. (+1 day) means the shift ends the following day.</p></OnePagePrint>}
  </>;
}

function ShiftForm({ shift, start, employees, onClose, onSaved, onDeleted }: { shift: BtbShift | null; start: string; employees: TeamMember[]; onClose: () => void; onSaved: (shift: BtbShift) => void; onDeleted: (id: string) => void }) {
  const { identity } = useBtbWorkspace();
  const [form, setForm] = useState({ employee_id: shift?.employee_id ?? (identity?.employeeId && employees.some((employee) => employee.id === identity.employeeId && employee.active) ? identity.employeeId : employees.find((employee) => employee.active)?.id) ?? "", shift_date: shift?.shift_date ?? start, start_time: shift?.start_time ?? "09:00", end_time: shift?.end_time ?? "17:00", ends_next_day: shift?.ends_next_day ?? false, duty: shift?.duty ?? "none" as ShiftDuty });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError("");
    try { const result = await fetchJson<{ shift: BtbShift }>("/api/btb/staff-schedule", jsonRequest({ ...form, id: shift?.id ?? null, version: shift?.version ?? 0 })); onSaved(result.shift); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!shift || saving) return;
    setSaving(true); setError("");
    try { await fetchJson("/api/btb/staff-schedule", jsonRequest({ id: shift.id, version: shift.version }, "DELETE")); onDeleted(shift.id); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title={shift ? "Edit shift" : "Add shift"} description="Assign the employee and time. Duty is optional — leave it on “No duty” if this shift has no opening, closing or prep responsibility." busy={saving} onClose={onClose}><form onSubmit={save}>{error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}<fieldset className="ui-form-stack" disabled={saving}>
    <label>Employee<select className="ui-input" data-modal-autofocus required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>{employees.filter((employee) => employee.active || employee.id === form.employee_id).map((employee) => <option key={employee.id} value={employee.id} disabled={!employee.active}>{employee.name}{employee.active ? "" : " (inactive)"}</option>)}</select></label>
    <label>Date<Input type="date" required min={start} max={addDays(start, 6)} value={form.shift_date} onChange={(event) => setForm({ ...form, shift_date: event.target.value })} /></label>
    <div className="ops-form-grid"><label>Start time<Input type="time" required value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} /></label><label>End time<Input type="time" required value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} /></label></div>
    <label className="ops-checkbox"><input type="checkbox" checked={form.ends_next_day} onChange={(event) => setForm({ ...form, ends_next_day: event.target.checked })} />Ends next day</label>
    <label>Responsibility<select className="ui-input" value={form.duty} onChange={(event) => setForm({ ...form, duty: event.target.value as ShiftDuty })}>{SHIFT_DUTIES.map((duty) => <option value={duty.value} key={duty.value}>{duty.label}</option>)}</select></label>
    {shift && <small>Last saved by {shift.updated_by_name}.</small>}
  </fieldset><div className="ui-modal__actions">{shift && <Button variant="danger" disabled={saving} onClick={remove}>Remove shift</Button>}<Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save shift"}</Button></div></form></Modal>;
}
