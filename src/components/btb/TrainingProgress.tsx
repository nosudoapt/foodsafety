"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import Modal from "@/components/Modal";
import { Badge, Button } from "@/components/ui";
import { LoadState } from "./Feedback";
import { useBtbData } from "./useBtbData";
import { employeeTrainingProgress, trainingStatus, TRAINING_STATUS_LABELS, type TrainingData, type TrainingRecord, type DisplayTrainingStatus } from "@/lib/btb-training";

export function TrainingStatusBadge({ status }: { status: DisplayTrainingStatus }) {
  return <Badge accent={status === "approved" ? "green" : status === "pending" ? "purple" : status === "changes_requested" || status === "needs_update" ? "amber" : "slate"}>{TRAINING_STATUS_LABELS[status]}</Badge>;
}

export function TrainingProgressTable({ data, onReview, ownId, compact = false }: { data: TrainingData; onReview?: (record: TrainingRecord) => void; ownId?: string | null; compact?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const employees = data.employees.filter((employee) => employee.active || includeInactive);
  const employee = data.employees.find((employee) => employee.id === selected);
  return <>
    {!compact && <label className="ops-checkbox"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />Include inactive employees</label>}
    {employees.length ? <div className={`ops-table-wrap ${compact ? "training-summary-scroll" : ""}`}><table className="ops-table training-progress-table"><caption>Completion counts only current modules approved by a manager.</caption><thead><tr><th scope="col">Employee</th><th scope="col">Approved training</th><th scope="col">Awaiting manager</th><th scope="col">Follow-up</th></tr></thead><tbody>{employees.map((member) => {
      const progress = employeeTrainingProgress(member.id, data.topics, data.records);
      return <tr key={member.id}><td><button className="ops-text-link" onClick={() => setSelected(member.id)}>{member.name}</button>{!member.active && <p className="ops-meta">Inactive</p>}</td><td><div className="training-progress-cell"><span>{progress.approved}/{progress.total}{progress.total > 0 && ` · ${progress.percent}%`}</span><progress className="ops-progress" value={progress.approved} max={progress.total || 1} aria-label={`${member.name}: ${progress.approved} of ${progress.total} modules approved`} /></div></td><td>{progress.pending > 0 ? <Badge accent="purple">{progress.pending} pending</Badge> : "—"}</td><td>{progress.needsUpdate + progress.changesRequested || "—"}</td></tr>;
    })}</tbody></table></div> : <div className="ui-empty"><GraduationCap size={26} /><h3>No employee training records yet</h3><p>Add employees to begin tracking individual progress.</p></div>}
    {employee && <Modal open title={`${employee.name} · training`} description="Published modules, progress and manager decisions." onClose={() => setSelected(null)}><div className="training-employee-modules">{data.topics.filter((topic) => topic.published).map((topic) => {
      const record = data.records.find((record) => record.employee_id === employee.id && record.topic_id === topic.id);
      const status = trainingStatus(record, topic);
      return <section key={topic.id}><h3>{topic.title}</h3><TrainingStatusBadge status={status} />{record && <><p className="ops-meta">{record.completed_sections.length} sections checked · module revision {record.topic_revision}</p>{record.reviewed_by_name && <p className="ops-meta">Reviewed by {record.reviewed_by_name}</p>}{record.review_notes && <p className="training-feedback">{record.review_notes}</p>}</>}{record && status === "pending" && onReview && <Button variant="soft" disabled={record.employee_id === ownId} onClick={() => { setSelected(null); onReview(record); }}>{record.employee_id === ownId ? "Another manager must review" : "Review submission"}</Button>}</section>;
    })}{!data.topics.some((topic) => topic.published) && <p className="ops-meta">No published modules yet.</p>}</div></Modal>}
  </>;
}

export default function TrainingDashboardPanel() {
  const { data, loading, error, reload } = useBtbData<TrainingData>("/api/btb/training?summary=1");
  const employees = data?.employees.filter((employee) => employee.active) ?? [];
  const pending = data ? employees.reduce((count, employee) => count + employeeTrainingProgress(employee.id, data.topics, data.records).pending, 0) : null;
  return <section className="dash-panel training-dashboard"><div className="ops-section-heading"><div><p className="dash-focus__label">Team development</p><h2>Training progress</h2></div><Link className="ops-text-link" href="/between-the-buns/training-guide?view=team">View team training</Link></div><p className="ops-meta">{data ? `${employees.length} active employees · ${pending} submissions awaiting manager approval` : "Current module completion and approvals"}</p><LoadState loading={loading} error={error} onRetry={reload} />{data && <TrainingProgressTable data={data} compact />}</section>;
}
