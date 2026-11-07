"use client";

import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, MailX, RefreshCw, Send } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";
import { checklistLines, type DailyReportData } from "@/lib/btb-daily-report";

/**
 * Reports & delivery: what the combined daily PDF contains, who received it,
 * and an audited resend. Resend requires report recipients to be configured
 * in location settings first - the SQL function refuses otherwise, and that
 * refusal surfaces verbatim.
 */

export interface DeliveryRow {
  id: string;
  kind: string;
  business_date: string | null;
  recipient: string;
  subject: string;
  status: "pending" | "sending" | "accepted" | "failed" | "cancelled";
  attempts: number;
  uncertain: boolean;
  provider_id: string | null;
  error: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface ReportsData {
  daily: DailyReportData;
  deliveries: DeliveryRow[];
}

const STATUS_LABEL: Record<DeliveryRow["status"], string> = {
  pending: "Queued",
  sending: "Sending",
  accepted: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

const KIND_LABEL: Record<string, string> = {
  daily: "Daily report",
  expiry: "Expiry reminder",
  notification: "Notification",
};

function stamp(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default function ReportsPanel({ date, locationId, data, loading, error, reload }: {
  date: string;
  locationId: string;
  data: ReportsData | null;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function resend() {
    if (!data || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const result = await fetchJson<{ result: { queued_recipients: number } }>(
        "/api/btb/platform/resend",
        jsonRequest({ location_id: locationId, date, key: crypto.randomUUID(), reason }),
      );
      setReason("");
      setNotice({ tone: "ok", text: `Resend queued for ${result.result.queued_recipients} configured recipient(s).` });
      reload();
    } catch (cause) {
      setNotice({ tone: "bad", text: messageOf(cause) });
    } finally {
      setSending(false);
    }
  }

  return <>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && <Card><div className="ops-panel" aria-label="Daily report preview">
      <div className="ops-toolbar">
        <div>
          <h2 className="ops-section-title">Covered in the {date} report</h2>
          <p className="ops-meta">The PDF emailed to configured recipients is generated from these saved records.</p>
        </div>
        <Button variant="ghost" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>
      </div>
      <ul className="ui-list">
        {checklistLines(data.daily).map((line) => <li key={line.kind} className="ui-list-row">
          <Badge accent={line.completed ? "green" : "amber"}>{line.completed ? "Complete" : line.present ? `${line.done}/${line.total}` : "Not saved"}</Badge>
          <div>
            <p className="ui-row-title">{line.label}</p>
            <p className="ops-meta">{line.savedBy ? `Saved by ${line.savedBy}` : "No saved record"}{line.notes ? ` · ${line.notes}` : ""}</p>
            {line.missing.length > 0 && <p className="ui-row-title ui-text-warning">{line.missing.length} outstanding task(s)</p>}
          </div>
        </li>)}
        <li className="ui-list-row">
          <Badge accent={(data.daily.temperatures ?? []).length > 0 ? "green" : "amber"}>{(data.daily.temperatures ?? []).length}</Badge>
          <div><p className="ui-row-title">Temperature readings (Celsius)</p>
            <p className="ops-meta">{(data.daily.equipment ?? []).length} equipment item(s) × scheduled slots</p></div>
        </li>
        <li className="ui-list-row">
          <Badge accent={(data.daily.sanitizer ?? []).length > 0 ? "green" : "amber"}>{(data.daily.sanitizer ?? []).length}</Badge>
          <div><p className="ui-row-title">Sanitizer PPM readings</p>
            <p className="ops-meta">Checked at {(data.daily.sanitizer_slots ?? []).join(", ") || "— no slots yet"}</p></div>
        </li>
      </ul>
    </div></Card>}

    {data && <Card><div className="ops-panel" aria-label="Report delivery log">
      <h2 className="ops-section-title">Delivery log</h2>
      <p className="ops-meta">Every scheduled or manually requested send for this location, newest first. Delivery attempts are capped at 5; an uncertain provider response retries on the same idempotency key.</p>
      {notice && <div className={`ui-notice ${notice.tone === "ok" ? "ui-notice--success" : "ui-notice--warning"}`}>
        {notice.tone === "ok" ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
        <span>{notice.text}</span>
      </div>}
      {data.deliveries.length === 0
        ? <p className="ui-empty">Nothing queued yet. Reports are sent to configured recipients at the location report time.</p>
        : <table className="ui-table">
          <caption>Email delivery log</caption>
          <thead><tr><th scope="col">Report</th><th scope="col">Recipient</th><th scope="col">Status</th><th scope="col">Attempt</th><th scope="col">Updated</th><th scope="col">Detail</th></tr></thead>
          <tbody>
            {data.deliveries.map((row) => <tr key={row.id}>
              <td><p className="ui-row-title">{KIND_LABEL[row.kind] ?? row.kind}</p><p className="ops-meta">{row.business_date ?? "—"}</p></td>
              <td className="ops-meta">{row.recipient}</td>
              <td><Badge accent={row.status === "accepted" ? "green" : row.status === "failed" ? "red" : "amber"}>
                {STATUS_LABEL[row.status]}{row.uncertain && row.status !== "accepted" ? " · uncertain" : ""}
              </Badge></td>
              <td className="ops-meta">#{row.attempts}</td>
              <td className="ops-meta">{stamp(row.accepted_at ?? row.created_at)}</td>
              <td className="ops-meta">{row.error ?? (row.provider_id ? `Provider ${row.provider_id.slice(0, 12)}…` : "—")}</td>
            </tr>)}
          </tbody>
        </table>}
    </div></Card>}

    {data && <Card><div className="ops-panel" aria-label="Request a resend">
      <h2 className="ops-section-title">Resend the {date} report</h2>
      <form
        className="ops-form"
        onSubmit={(event) => { event.preventDefault(); void resend(); }}
      >
        <label htmlFor={reasonId}>Reason for the resend <span className="ops-meta">(recorded in the audit log)</span></label>
        <Input id={reasonId} value={reason} maxLength={500} placeholder="e.g. Recipient added after the scheduled send"
          onChange={(event) => setReason(event.target.value)} />
        <Button type="submit" variant="soft" disabled={sending || reason.trim().length < 3}>
          {sending ? <Clock size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          {sending ? "Queueing…" : "Queue resend"}
        </Button>
        <p className="ops-meta"><MailX size={14} aria-hidden="true" /> Recipients come from this location&apos;s settings; the requester&apos;s reason is stored with the request.</p>
      </form>
    </div></Card>}
  </>;
}
