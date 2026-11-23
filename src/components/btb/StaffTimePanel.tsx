"use client";

import { useState } from "react";
import { Clock3, Download } from "lucide-react";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, StatTile } from "@/components/ui";
import { useBtbCommand } from "./useBtbCommand";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { approvedHoursCsv, canClock, canReviewTime, entryMinutes, hoursLabel, hoursTotals, timeProblem, type TimeAction, type TimeData, type TimeEntry } from "@/lib/btb-time";
import type { BtbRole } from "@/lib/btb-roles";

const LABELS = { open: "Clock running", pending: "Pending approval", changes_requested: "Changes requested", approved: "Approved" } as const;
const stamp = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "medium", timeStyle: "long" }).format(new Date(value)) : "Missing";
const DEVICE_KEY = "btb_clock_device";
function clockDevice(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const value = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, value);
    return value;
  } catch { return crypto.randomUUID(); }
}
async function clockPresence(): Promise<Record<string, number | string>> {
  const device = clockDevice();
  if (typeof navigator === "undefined" || !navigator.geolocation) return { device };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ device, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => resolve({ device }),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    );
  });
}

export default function StaffTimePanel({ locationId, start, data, reload }: { locationId: string; start: string; data: TimeData; reload: () => void }) {
  const { identity } = useBtbWorkspace(), role = identity?.role ?? "staff", employeeId = identity?.employeeId ?? "";
  const command = useBtbCommand("/api/btb/platform/time", reload), [validation, setValidation] = useState("");
  const [filter, setFilter] = useState(""), [editing, setEditing] = useState<TimeEntry | null>(null), [reviewing, setReviewing] = useState<{ entry: TimeEntry; action: "approve" | "request_changes" | "reopen" } | null>(null);
  const act = async (action: TimeAction, values: Record<string, unknown>, message: string) => {
    const problem = timeProblem(action, values); setValidation(problem ?? "");
    return !problem && await command.run({ location_id: locationId, action, data: values }, message);
  };
  const entries = data.entries.filter((entry) => !filter || entry.employee_id === filter), totals = hoursTotals(entries);
  const fullTeam = ["manager", "corporate", "owner"].includes(role), reviewer = canReviewTime(role);
  const feedback = <>{(validation || command.error) && <p className="ui-notice ui-notice--error" role="alert">{validation || command.error}</p>}{command.notice && <p className="ui-notice ui-notice--success" role="status">{command.notice}</p>}</>;
  const name = (id: string) => data.employees.find((employee) => employee.id === id)?.name ?? "Former employee";
  return <section className="ops-panel staff-time-workspace" aria-label="Worked hours and approvals">
    {employeeId && canClock(role) && <ClockCard locationId={locationId} data={data} employeeId={employeeId} busy={command.busy} act={act} feedback={feedback} onCorrect={(entry) => setEditing(entry)} />}
    <div className="inventory-metrics"><StatTile label={fullTeam ? "Recorded worked hours" : "My recorded hours"} value={hoursLabel(totals.worked)} /><StatTile label="Approved hours" value={hoursLabel(totals.approved)} accent="green" /><StatTile label="Awaiting review / correction" value={totals.pending} accent="amber" /><StatTile label="Open clocks this week" value={totals.open} /></div>
    <Card><div className="ops-panel"><div className="ops-toolbar"><div><h3><Clock3 size={18} aria-hidden="true" />Worked hours · {start}</h3><p className="ops-meta">Times are shown in {data.timezone}. Business dates follow the location&apos;s day-start cutoff. Scheduled shifts are not worked hours. Originals are preserved, corrections audited, and only another manager or owner can approve.</p></div><Button variant="ghost" disabled={totals.approved === null || !entries.some((entry) => entry.status === "approved")} onClick={() => {
      try {
        const url = URL.createObjectURL(new Blob([approvedHoursCsv(entries, data.employees, data.timezone)], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `btb-approved-hours-${start}.csv`; link.click(); URL.revokeObjectURL(url);
      } catch (error) { setValidation(error instanceof Error ? error.message : "Approved hours could not be exported. Reload and review the records."); }
    }}><Download size={16} aria-hidden="true" />Export approved hours</Button></div>
      {fullTeam && <label className="ops-inline-field">Hours employee<select className="ui-input" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All employees</option>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
      {feedback}
      {!entries.length ? <p className="ui-empty">No worked-time records for this week and employee view.</p> : <div className="ops-table-wrap"><table className="ops-table"><caption>Actual time records — originals and reviewed corrections</caption><thead><tr><th scope="col">Employee / business date</th><th scope="col">Effective worked times</th><th scope="col">Original punches</th><th scope="col">Unpaid break</th><th scope="col">Worked hours</th><th scope="col">Approval</th><th scope="col">Actions</th></tr></thead><tbody>{entries.map((entry) => {
        const own = entry.employee_id === employeeId, canCorrect = entry.status !== "approved" && (own || reviewer);
        const scheduled = data.shifts.find((row) => row.employee_id === entry.employee_id && row.shift_date === entry.work_date);
        return <tr key={entry.id}><td><strong>{name(entry.employee_id)}</strong><p className="ops-meta">{entry.work_date}</p>{scheduled ? <p className="ops-meta">Required {scheduled.start_time}–{scheduled.end_time}{scheduled.ends_next_day ? " (+1 day)" : ""} · clocked in {stamp(entry.recorded_in, data.timezone)}</p> : <p className="ops-meta">Unscheduled · clocked in {stamp(entry.recorded_in, data.timezone)}</p>}</td><td>{stamp(entry.effective_in, data.timezone)}<p className="ops-meta">to {entry.effective_out ? stamp(entry.effective_out, data.timezone) : "Still open"}</p>{entry.notes && <p className="ops-meta">{entry.notes}</p>}</td><td>{stamp(entry.recorded_in, data.timezone)}<p className="ops-meta">to {stamp(entry.recorded_out, data.timezone)}</p></td><td>{entry.break_minutes === null ? "Missing" : `${entry.break_minutes} min`}</td><td>{entry.status === "open" ? "Running — not approved" : hoursLabel(entryMinutes(entry))}</td><td><Badge accent={entry.status === "approved" ? "green" : entry.status === "changes_requested" ? "red" : "amber"}>{LABELS[entry.status]}</Badge>{!!entry.incomplete_tasks?.length && <p className="ops-meta" role="status">Assigned duties still open: {entry.incomplete_tasks.map((task) => task.task_type.replaceAll("_", " ")).join(", ")}</p>}{entry.reviewed_by_name && <p className="ops-meta">{entry.reviewed_by_name} · {stamp(entry.reviewed_at, data.timezone)}</p>}{entry.review_notes && <p className="ops-meta">{entry.review_notes}</p>}</td><td><div className="finance-row-actions">{canCorrect && <Button variant="ghost" disabled={command.busy} onClick={() => setEditing(entry)}>Correct hours</Button>}{reviewer && !own && <>{entry.status === "pending" && <><Button variant="soft" disabled={command.busy} onClick={() => setReviewing({ entry, action: "approve" })}>Approve hours</Button><Button variant="ghost" disabled={command.busy} onClick={() => setReviewing({ entry, action: "request_changes" })}>Request correction</Button></>}{entry.status === "approved" && <Button variant="danger" disabled={command.busy} onClick={() => setReviewing({ entry, action: "reopen" })}>Reopen approval</Button>}</>}{reviewer && own && <small>Another manager / owner must approve your hours.</small>}</div></td></tr>;
      })}</tbody></table></div>}
      <details><summary>Time audit history · {data.history.length} events</summary><ol className="finance-audit">{data.history.map((event) => <li key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong> · {event.actor_name}<p className="ops-meta">{stamp(event.created_at, data.timezone)}{event.reason ? ` · ${event.reason}` : ""}</p></li>)}</ol></details>
    </div></Card>
    {editing && <CorrectionForm entry={editing} timezone={data.timezone} busy={command.busy} act={act} feedback={feedback} onClose={() => setEditing(null)} />}
    {reviewing && <ReviewForm entry={reviewing.entry} action={reviewing.action} employee={name(reviewing.entry.employee_id)} busy={command.busy} act={act} feedback={feedback} onClose={() => setReviewing(null)} />}
  </section>;
}
type TimeAct = (action: TimeAction, data: Record<string, unknown>, message: string) => Promise<boolean>;
function ClockCard({ locationId, data, employeeId, busy, act, feedback, onCorrect }: { locationId: string; data: TimeData; employeeId: string; busy: boolean; act: TimeAct; feedback: React.ReactNode; onCorrect: (entry: TimeEntry) => void }) {
  const [shift, setShift] = useState(""), [breaks, setBreaks] = useState(""), [notes, setNotes] = useState("");
  const open = data.open_entry, here = open?.location_id === locationId;
  const shifts = data.shifts.filter((row) => row.employee_id === employeeId && Math.abs(Date.parse(row.shift_date) - Date.parse(data.today)) <= 86_400_000);
  return <Card><div className="ops-panel"><div className="ops-toolbar"><h3><Clock3 size={18} aria-hidden="true" />My time clock</h3><Badge accent={open ? "green" : "slate"}>{open ? "Clock running" : "Not clocked in"}</Badge></div><p className="ops-meta">Clocking records the server&apos;s current time, never the tablet&apos;s clock. {data.timezone} · local date {data.today}. Enter actual unpaid break minutes, including 0 if none. When the branch requires it, the server also checks the restaurant geofence, network and approved device.</p>
    {open && !here ? <p className="ui-notice ui-notice--warning">Your clock is running at another location. Select that location to clock out, or ask its manager to correct a stale entry. You cannot start a second clock.</p> : <form className="ui-form-stack" onSubmit={async (event) => { event.preventDefault(); if (open) { if (await act("clock_out", { id: open.id, version: open.version, break_minutes: breaks.trim() === "" ? null : Number(breaks), notes }, "Clock-out confirmed. Actual hours are pending manager approval.")) { setBreaks(""); setNotes(""); } } else if (shift) { const presence = await clockPresence(); if (await act("clock_in", { shift_id: shift === "unscheduled" ? null : shift, notes, ...presence }, "Clock-in confirmed.")) setNotes(""); } }}>
      <fieldset disabled={busy} className="ops-fieldset ops-form-grid">{open ? <><p>Started {stamp(open.recorded_in, data.timezone)}<br /><strong>Business date {open.work_date}</strong></p><label>Actual unpaid break minutes<Input required type="number" min={0} max={1440} step={1} value={breaks} onChange={(event) => setBreaks(event.target.value)} /></label></> : <label>Clock-in shift<select className="ui-input" required value={shift} onChange={(event) => setShift(event.target.value)}><option value="">Choose your shift</option><option value="unscheduled">Unscheduled — no linked shift</option>{shifts.map((row) => <option key={row.id} value={row.id}>{row.shift_date} · {row.start_time}–{row.end_time}{row.ends_next_day ? " (+1 day)" : ""}</option>)}</select>{shift && shift !== "unscheduled" && <small>Required start {shifts.find((row) => row.id === shift)?.start_time ?? "—"} · the server records the actual clock-in time.</small>}</label>}<label>Time-clock notes (optional)<Input maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></fieldset>{feedback}<div className="ui-actions"><Button type="submit" disabled={busy || !open && !shift}>{busy ? "Confirming…" : open ? "Clock out & submit hours" : "Clock in now"}</Button>{open && <Button variant="ghost" disabled={busy} onClick={() => onCorrect(open)}>Correct a missed / stale punch</Button>}</div>
    </form>}
  </div></Card>;
}
function CorrectionForm({ entry, timezone, busy, act, feedback, onClose }: { entry: TimeEntry; timezone: string; busy: boolean; act: TimeAct; feedback: React.ReactNode; onClose: () => void }) {
  const [start, setStart] = useState(new Date(entry.effective_in).toISOString()), [end, setEnd] = useState(entry.effective_out ? new Date(entry.effective_out).toISOString() : ""), [breaks, setBreaks] = useState(entry.break_minutes === null ? "" : String(entry.break_minutes)), [reason, setReason] = useState("");
  return <Modal open title="Correct worked hours" description="This proposes corrected times for approval; it never overwrites original punches. Approved hours must be reopened by another manager before correction." busy={busy} onClose={onClose}><form className="ui-form-stack" onSubmit={async (event) => { event.preventDefault(); if (await act("correct", { id: entry.id, version: entry.version, effective_in: start.trim(), effective_out: end.trim(), break_minutes: breaks.trim() === "" ? null : Number(breaks), reason: reason.trim() }, "Correction recorded. Hours are pending another manager's approval.")) onClose(); }}><p className="ops-meta">Original start: {stamp(entry.recorded_in, timezone)}<br />Original end: {stamp(entry.recorded_out, timezone)}<br />Enter ISO timestamps with seconds and a UTC offset, such as 2026-11-18T09:00:00-07:00, or use UTC with Z. Explicit offsets avoid daylight-saving ambiguity. End must be in the past, after start, and within 24 hours.</p><fieldset className="ops-fieldset ui-form-stack" disabled={busy}><label>Corrected start (ISO + offset)<Input data-modal-autofocus required value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Corrected end (ISO + offset)<Input required value={end} onChange={(event) => setEnd(event.target.value)} /></label><label>Actual unpaid break minutes<Input required type="number" min={0} max={1440} step={1} value={breaks} onChange={(event) => setBreaks(event.target.value)} /></label><label>Correction reason / evidence<Input required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label></fieldset>{feedback}<div className="ui-modal__actions"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Submit explained correction"}</Button></div></form></Modal>;
}
function ReviewForm({ entry, action, employee, busy, act, feedback, onClose }: { entry: TimeEntry; action: "approve" | "request_changes" | "reopen"; employee: string; busy: boolean; act: TimeAct; feedback: React.ReactNode; onClose: () => void }) {
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const title = action === "approve" ? "Approve worked hours" : action === "reopen" ? "Reopen hours approval" : "Request hours correction";
  return <Modal open title={title} description={`${employee} · business date ${entry.work_date} · ${hoursLabel(entryMinutes(entry))}. Originals, corrections and review decisions remain auditable.`} busy={busy} onClose={onClose}><form className="ui-form-stack" onSubmit={async (event) => { event.preventDefault(); if ((action !== "approve" || confirmed) && await act(action, { id: entry.id, version: entry.version, reason: reason.trim() }, action === "approve" ? "Worked hours approved by the manager; ready for approved-hours export." : "Hours review decision recorded.")) onClose(); }}>{!!entry.incomplete_tasks?.length && <p className="ui-notice ui-notice--warning" role="status">This clock-out recorded incomplete assigned duties: {entry.incomplete_tasks.map((task) => task.task_type.replaceAll("_", " ")).join(", ")}. Approving confirms the manager accepts that exception.</p>}<label>{action === "approve" ? "Review notes (optional)" : "Required correction reason"}<Input data-modal-autofocus disabled={busy} required={action !== "approve"} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{action === "approve" && <label className="ops-checkbox"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I verified the actual times, unpaid breaks and any explained corrections for this employee.</span></label>}{feedback}<div className="ui-modal__actions"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant={action === "reopen" ? "danger" : "solid"} disabled={busy || action === "approve" && !confirmed}>{busy ? "Saving…" : title}</Button></div></form></Modal>;
}

export const scheduleLead = (role: BtbRole) => ["supervisor", "manager", "owner"].includes(role);
