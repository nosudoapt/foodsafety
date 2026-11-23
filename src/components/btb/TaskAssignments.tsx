"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import { messageOf } from "@/components/btb/Feedback";
import { TASK_TYPES, taskLabel, type TaskAssignment, type TaskType } from "@/lib/btb-tasks";
import type { TeamMember } from "@/lib/btb-team";

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Manager/supervisor assigns duties; staff see their own list. Completion is
 *  read from the actual temperature/prep/checklist/cleaning record. */
export default function TaskAssignments({ locationId, start, employees }: { locationId: string; start: string; employees: TeamMember[] }) {
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ assignments: TaskAssignment[]; canManage?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employee_id: "", task_date: start, task_type: "temperature" as TaskType, note: "" });
  const reload = () => { setLoading(true); setRevision((value) => value + 1); };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void fetchJson<{ assignments: TaskAssignment[]; canManage: boolean }>(`/api/btb/task-assignments?location=${locationId}&start=${start}`, { signal: controller.signal })
      .then((result) => { if (!cancelled) { setData(result); setError(""); } })
      .catch((cause) => { if (!cancelled) setError(messageOf(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [locationId, start, revision]);

  const assignments = data?.assignments ?? [];
  const canManage = data?.canManage === true;
  const incomplete = assignments.filter((item) => !item.completed).length;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !form.employee_id) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await fetchJson("/api/btb/task-assignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, ...form }),
      });
      setNotice("Assigned duty saved.");
      setForm((current) => ({ ...current, note: "" }));
      reload();
    } catch (cause) { setError(cause instanceof RequestError ? cause.message : "The assignment could not be saved."); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await fetchJson("/api/btb/task-assignments", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, location_id: locationId }),
      });
      reload();
    } catch (cause) { setError(cause instanceof RequestError ? cause.message : "The assignment could not be removed."); }
    finally { setSaving(false); }
  };

  return <Card><div className="ops-panel">
    <div className="ops-toolbar"><div><h3>Assigned duties</h3><p className="ops-meta">Temperature, prep, opening/closing and cleaning duties for this week. The badge is derived from the actual saved record, not a manual tick.</p></div>{!loading && <Badge accent={incomplete ? "amber" : "green"}>{incomplete ? `${incomplete} still open` : "All assigned duties complete"}</Badge>}</div>
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    {canManage && <form onSubmit={save} className="ops-form-grid" aria-busy={saving}>
      <label>Employee<select className="ui-input" required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}><option value="">Choose an employee</option>{employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
      <label>Date<Input type="date" required min={start} max={addDays(start, 6)} value={form.task_date} onChange={(event) => setForm({ ...form, task_date: event.target.value })} /></label>
      <label>Duty<select className="ui-input" value={form.task_type} onChange={(event) => setForm({ ...form, task_type: event.target.value as TaskType })}>{TASK_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label>Note <span>optional</span><Input maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
      <div className="ui-actions"><Button type="submit" disabled={saving || !form.employee_id}>{saving ? "Saving…" : "Assign duty"}</Button></div>
    </form>}
    {loading ? <p className="ops-meta" role="status">Loading assigned duties…</p> : !assignments.length ? <p className="ui-empty">No duties assigned for this week.</p> : <div className="ops-table-wrap"><table className="ops-table"><caption>Assigned duties and their actual completion record</caption><thead><tr><th scope="col">Date</th><th scope="col">Employee</th><th scope="col">Duty</th><th scope="col">Note</th><th scope="col">Record</th>{canManage && <th scope="col">Action</th>}</tr></thead><tbody>{assignments.map((item) => <tr key={item.id}><td>{item.task_date}</td><td>{item.employee_name ?? "—"}</td><td>{taskLabel(item.task_type)}</td><td>{item.note || "—"}</td><td><Badge accent={item.completed ? "green" : "amber"}>{item.completed ? "Complete" : "Open"}</Badge></td>{canManage && <td><Button variant="ghost" disabled={saving} onClick={() => void remove(item.id)}>Remove</Button></td>}</tr>)}</tbody></table></div>}
  </div></Card>;
}

