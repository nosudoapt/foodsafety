"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Clock3, Mail, RefreshCw, Send } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { fetchJson } from "@/lib/fetch-json";
import { btbToday } from "@/lib/btb-team";
import { licenceExpiryLabel } from "@/lib/btb-licences";
import { parseReminderEmails, reminderStatusLabel, reminderLead, validateReminderSettings, type ReminderData, type ReminderJob, type ReminderRun, type ReminderSettings } from "@/lib/btb-reminders";

export default function LicenceRemindersPage() {
  return <BtbFeatureGate feature="licence_reminders">{() => <ReminderWorkspace />}</BtbFeatureGate>;
}

function ReminderWorkspace() {
  const { data, loading, error, reload, update } = useBtbData<ReminderData>("/api/btb/licence-reminders");
  const [notice, setNotice] = useState("");
  const [runError, setRunError] = useState("");
  const [running, setRunning] = useState(false);
  const [older, setOlder] = useState<ReminderJob[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [paging, setPaging] = useState(false);
  const logs = [...new Map([...(data?.logs ?? []), ...older].map((job) => [job.id, job])).values()];
  const due = data?.documents.filter((document) => reminderLead(document.expiry_date, btbToday(), data.settings.lead_days) !== null) ?? [];
  const run = async () => {
    if (running) return; setRunning(true); setRunError(""); setNotice("");
    try {
      const result = await fetchJson<ReminderRun>("/api/btb/licence-reminders", { ...jsonRequest({ action: "run" }), signal: AbortSignal.timeout(65_000) });
      setNotice(result.disabled ? "Reminders are paused. Enable and save the settings to send emails." : `${result.sent} emails accepted by the provider. ${result.failed} failed. ${result.remaining} waiting for the next batch.`);
    } catch (cause) { setRunError(messageOf(cause)); }
    finally {
      try { const latest = await fetchJson<ReminderData>("/api/btb/licence-reminders"); update(() => latest); setOlder([]); setMore(null); }
      catch { setRunError((previous) => previous || "Refresh to see the latest delivery results."); }
      setRunning(false);
    }
  };
  const next = async () => {
    if (paging) return; setPaging(true); setRunError("");
    try { const result = await fetchJson<ReminderData>(`/api/btb/licence-reminders?offset=${logs.length}`); setOlder([...older, ...result.logs]); setMore(result.hasMore); }
    catch (cause) { setRunError(messageOf(cause)); }
    finally { setPaging(false); }
  };
  return <div className="ops-workspace"><PageHeader title="Licence email reminders" subtitle="Keep managers and corporate ahead of business renewals and employee certificate expiries." action={<Button variant="ghost" disabled={loading || running} onClick={() => { setOlder([]); setMore(null); reload(); }}><RefreshCw size={17} />Reload saved settings</Button>} />
    <LoadState loading={loading} error={error} onRetry={reload} />
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}{runError && <p className="ui-notice ui-notice--error" role="alert">{runError}</p>}
    {data && <><div className="reminder-layout"><Card className="reminder-settings"><div className="ops-card-heading"><Mail size={24} aria-hidden="true" /><div><h2>Who receives the reminders?</h2><p>Every due reminder goes to both recipient groups.</p></div><Badge accent={data.settings.enabled ? "green" : "slate"}>{data.settings.enabled ? "Enabled" : "Paused"}</Badge></div><ReminderForm key={data.settings.version} settings={data.settings} disabled={running} onSaved={(settings) => { update((current) => ({ ...current, settings })); setNotice("Reminder settings saved."); }} /></Card>
      <div className="ops-workspace"><Card className="reminder-status"><h2>Delivery service</h2><p><span className={`ui-icon ui-tone--${data.service.senderConfigured ? "green" : "amber"}`}>{data.service.senderConfigured ? <Check size={18} /> : <Mail size={18} />}</span><span><strong>{data.service.senderConfigured ? "Email sender configured" : "Email sender needs setup"}</strong><small>{data.service.senderConfigured ? "Resend will send from your verified address." : "Set RESEND_API_KEY and BTB_EMAIL_FROM on the server."}</small></span></p><p><span className={`ui-icon ui-tone--${data.service.schedulerConfigured ? "green" : "amber"}`}><Clock3 size={18} /></span><span><strong>{data.service.schedulerConfigured ? "Scheduler secret configured" : "Scheduler needs setup"}</strong><small>{data.service.schedulerConfigured ? "Deploy the daily 09:00 Saskatchewan schedule or connect your scheduler." : "Set CRON_SECRET and deploy the included daily schedule."}</small></span></p><div className="reminder-last-run"><span>Last run</span><strong>{data.settings.last_run_at ? new Date(data.settings.last_run_at).toLocaleString("en-CA", { timeZone: "America/Regina" }) + " · Saskatchewan" : "Not run yet"}</strong>{data.settings.last_run_error && <p>{data.settings.last_run_error}</p>}</div><Button disabled={running || !data.settings.enabled || !data.service.senderConfigured} onClick={run}><Send size={17} />{running ? "Sending reminders…" : "Send due reminders now"}</Button><p className="ops-meta">Uses saved settings. Already-sent reminders are skipped; each reminder allows up to three total delivery attempts.</p></Card>
      <Card className="reminder-status"><h2>Which records are included?</h2><p className="ops-meta">Company-wide BTB records with an expiry date. Reminders use the closest reached window, including overdue dates, so a missed run can catch up.</p><Link className="ops-text-link" href="/between-the-buns/compliance">Business licences & renewals</Link><Link className="ops-text-link" href="/between-the-buns/staff-licenses">Employee certificates</Link></Card></div></div>
      <section className="ops-workspace"><div className="ops-section-heading"><h2>In a reminder window</h2><Badge accent="purple">{due.length} records</Badge></div>{due.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th scope="col">Licence or certificate</th><th scope="col">Expiry</th><th scope="col">Reminder window</th></tr></thead><tbody>{due.map((document) => <tr key={`${document.source}:${document.id}`}><th scope="row">{document.name}</th><td>{document.expiry_date}<br /><span className="ops-meta">{licenceExpiryLabel(document.expiry_date, btbToday())}</span></td><td>{reminderLead(document.expiry_date, btbToday(), data.settings.lead_days) === 0 ? "Expiry / overdue" : `${reminderLead(document.expiry_date, btbToday(), data.settings.lead_days)} days`}</td></tr>)}</tbody></table></div> : <div className="ui-empty"><Check size={26} /><h3>No records in a reminder window.</h3><p>Saved expiry dates will appear here when their window begins.</p></div>}</section>
      <section className="ops-workspace"><div className="ops-section-heading"><h2>Email delivery history</h2><Badge>{logs.length} loaded</Badge></div><p className="ops-meta">“Sent” means accepted by the email provider. Check Resend for inbox delivery or bounces. Uncertain deliveries stop retrying after 23 hours to prevent duplicate email.</p>{logs.length ? <div className="ops-table-wrap"><table className="ops-table reminder-history"><thead><tr><th scope="col">Reminder</th><th scope="col">Recipient</th><th scope="col">Status</th><th scope="col">Last result</th></tr></thead><tbody>{logs.map((job) => <tr key={job.id}><th scope="row">{job.document_name}<span className="ops-meta">Expires {job.expiry_date} · {job.lead_days}-day window</span></th><td>{job.recipient}</td><td><Badge accent={job.status === "sent" ? "green" : job.status === "failed" ? "red" : "amber"}>{reminderStatusLabel(job, Date.parse(data.asOf))}</Badge><span className="ops-meta">Attempt {job.attempts} of 3</span></td><td>{job.error || (job.sent_at ? new Date(job.sent_at).toLocaleString("en-CA", { timeZone: "America/Regina" }) : "Awaiting a confirmed result")}{job.provider_id && <span className="ops-meta">Message {job.provider_id}</span>}</td></tr>)}</tbody></table></div> : <div className="ui-empty"><Mail size={26} /><h3>No email attempts yet.</h3><p>Enable reminders after saving manager and corporate recipients.</p></div>}{(more ?? data.hasMore) && <Button variant="ghost" disabled={paging} onClick={next}>{paging ? "Loading history…" : "Load older email attempts"}</Button>}</section>
    </>}
  </div>;
}

function ReminderForm({ settings, disabled, onSaved }: { settings: ReminderSettings; disabled: boolean; onSaved: (settings: ReminderSettings) => void }) {
  const [managers, setManagers] = useState(settings.manager_emails.join("\n"));
  const [corporate, setCorporate] = useState(settings.corporate_emails.join("\n"));
  const [leadDays, setLeadDays] = useState(settings.lead_days.join(", "));
  const [enabled, setEnabled] = useState(settings.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || disabled) return;
    const body = { version: settings.version, enabled, manager_emails: parseReminderEmails(managers), corporate_emails: parseReminderEmails(corporate), lead_days: leadDays.split(/[\s,]+/).filter(Boolean).map(Number) };
    const invalid = validateReminderSettings(body);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError("");
    try { const result = await fetchJson<{ settings: ReminderSettings }>("/api/btb/licence-reminders", jsonRequest(body)); onSaved(result.settings); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="ops-workspace">{error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}<fieldset disabled={saving || disabled} className="ui-form-stack"><label>Manager email addresses<textarea className="ui-input" rows={3} maxLength={2600} value={managers} onChange={(event) => setManagers(event.target.value)} autoCapitalize="none" spellCheck={false} placeholder="manager@your-restaurant.ca" /><small>One address per line, or separate with commas. Up to 10.</small></label><label>Corporate email addresses<textarea className="ui-input" rows={3} maxLength={2600} value={corporate} onChange={(event) => setCorporate(event.target.value)} autoCapitalize="none" spellCheck={false} placeholder="corporate@your-company.ca" /><small>At least one address in each group is required when enabled.</small></label><label>Days before expiry<Input value={leadDays} onChange={(event) => setLeadDays(event.target.value)} maxLength={60} /><small>For example: 30, 7, 1, 0. Zero includes the expiry day and overdue records.</small></label><label className="ops-checkbox"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Enable licence-expiry emails</label></fieldset><div className="ui-actions"><Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : "Save reminder settings"}</Button><span className="ops-meta">Version {settings.version}</span></div></form>;
}
