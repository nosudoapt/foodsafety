"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Building2, Database, RefreshCcw, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { BTB_MONITORING_WINDOWS, type BtbAdminMonitoring, type BtbAdminMonitoringLocation } from "@/lib/btb-admin";

const mb = (bytes: number) => bytes <= 0 ? "0 KB"
  : bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1_048_576).toLocaleString("en-CA", { maximumFractionDigits: 1 })} MB`;
const when = (value: string) => new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
const dayLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`;
const ENTITY_LABELS: Record<string, string> = {
  console_location: "Location", console_person: "Person", file: "File", settings: "Settings",
  ai_settings: "AI settings", operations: "Operations", inventory: "Inventory",
  compliance: "Compliance", marketing: "Marketing", finance: "Finance", time: "Hours",
};
/** Cell shading mirrors the legend key: 14% brand at one visit up to 100% at peak. */
const heat = (count: number, peak: number) =>
  `color-mix(in oklab, var(--brand) ${Math.round(14 + 86 * (count / peak))}%, var(--surface))`;

export default function BtbAdminOverview() {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useBtbData<BtbAdminMonitoring>(`/api/btb/admin/monitoring?days=${days}`);
  const locations = data?.locations ?? [];
  const peak = Math.max(1, ...(data?.heatmap.flat() ?? [0]));
  const visits = (data?.heatmap ?? []).reduce((sum, row) => sum + row.reduce((total, cell) => total + cell, 0), 0);
  return <div className="btb-console__stack">
    <PageHeader
      title="The group, at a glance."
      subtitle="Access, storage and workspace activity across the locations this console manages."
      action={<div className="btb-console__toolbar">
        <label className="btb-console__window">Activity window
          <select className="ui-input" value={days} onChange={event => setDays(Number(event.target.value))}>
            {BTB_MONITORING_WINDOWS.map(option => <option key={option} value={option}>Last {option} days</option>)}
          </select>
        </label>
        <Button accent="red" variant="ghost" disabled={loading} onClick={reload}><RefreshCcw size={16} aria-hidden="true" />Refresh</Button>
      </div>}
    />
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && !error && (locations.length === 0 ? <EmptyOverview /> : <>
      <div className="btb-console__metrics">
        <Metric icon={Building2} label="Managed locations" value={String(data.totals.active_locations)}
          hint={data.totals.active_locations === data.totals.locations ? `All ${data.totals.locations} of this console’s sites are active` : `${data.totals.locations - data.totals.active_locations} closed of ${data.totals.locations}`} />
        <Metric icon={UsersRound} label="People with access" value={String(data.totals.people)} hint="Named memberships across managed locations" />
        <Metric icon={Database} label="Files stored" value={String(data.totals.files)} hint={`${mb(data.totals.storage_bytes)} of ${mb(data.totals.storage_limit_bytes)} in location limits`} />
        <Metric icon={Activity} label="Workspace visits" value={String(data.totals.views)} hint={`Attributed page visits in the last ${data.days} days`} />
        <Metric icon={UsersRound} label="On site now" value={String(data.totals.open_entries)} hint="Open time entries across managed locations" />
        <Metric icon={ShieldCheck} label="Open problems" value={String(data.totals.problems)}
          hint={data.totals.problems === 0 ? "No failed emails, imports or hours to review" : "Failed email jobs, import errors and hours needing changes"} />
        <Metric icon={Sparkles} label="AI compute units" value={String(data.totals.ai_used)} badge
          hint="Approximation of extraction load, not billable tokens" />
      </div>
      <section className="ui-card btb-console__panel" aria-labelledby="overview-storage-heading">
        <h2 id="overview-storage-heading">Storage by location</h2>
        <p className="btb-console__hint">Every upload shares its location’s limit — 50 MB by default. The console sets each limit per site.</p>
        <div className="btb-console__storage-list">
          {locations.map(location => <StorageRow key={location.id} location={location} />)}
        </div>
      </section>
      <section className="ui-card btb-console__panel" aria-labelledby="overview-activity-heading">
        <h2 id="overview-activity-heading">Workspace activity</h2>
        <p className="btb-console__hint">Attributed page visits by day and hour (UTC) across managed locations.</p>
        <div className="btb-console__scroll" role="region" aria-label="Visits by day and hour" tabIndex={0}>
          <table className="btb-console__heatmap">
            <thead><tr><th scope="col"><span className="sr-only">Day</span></th>{HOURS.map(hour => <th scope="col" key={hour}>{hour}</th>)}</tr></thead>
            <tbody>
              {data.heatmap.map((row, index) => <tr key={index}>
                <th scope="row">{dayLabel(data.day_labels[index])}</th>
                {row.map((count, hour) => <td key={hour} className={count ? undefined : "btb-console__heat-zero"} style={count ? { background: heat(count, peak) } : undefined}>{count}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="btb-console__hint">Fewer<span className="btb-console__heat-key" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map(step => <span key={step} style={{ background: heat(Math.ceil(step * peak), peak) }} />)}
        </span>More · peak {peak} {peak === 1 ? "visit" : "visits"} in one hour · {visits} visits in this window</p>
      </section>
      <section className="ui-card btb-console__panel" aria-labelledby="overview-health-heading">
        <h2 id="overview-health-heading">Operational health by location</h2>
        <p className="btb-console__hint">Last activity, busiest hour and most-used features come from each location’s event stream. “Today” counts completed checks, temperature and sanitizer readings; AI is this window’s usage against the daily limit. A dash means no data yet.</p>
        <div className="btb-console__scroll" role="region" aria-label="Operational health by location" tabIndex={0}>
          <table className="btb-console__health">
            <thead><tr>
              <th scope="col">Location</th><th scope="col">Last activity</th><th scope="col">Busiest hour</th>
              <th scope="col">Most used</th><th scope="col">On site</th><th scope="col">Today</th>
              <th scope="col">Problems</th><th scope="col">AI</th><th scope="col">Queue</th>
            </tr></thead>
            <tbody>{locations.map(location => <HealthRow key={location.id} location={location} days={data.days} />)}</tbody>
          </table>
        </div>
      </section>
      <section className="ui-card btb-console__panel" aria-labelledby="overview-events-heading">
        <h2 id="overview-events-heading">Latest events</h2>
        {data.recent.length === 0 ? <p className="btb-console__hint">No events recorded yet.</p> :
          <div className="btb-console__scroll" role="region" aria-label="Recent events" tabIndex={0}>
            <table className="btb-console__events">
              <thead><tr><th scope="col">When</th><th scope="col">Location</th><th scope="col">Event</th><th scope="col">By</th></tr></thead>
              <tbody>{data.recent.map((event, index) => <tr key={index}>
                <td>{when(event.created_at)}</td><td>{event.location}</td>
                <td>{ENTITY_LABELS[event.entity_type] ?? event.entity_type} · {event.action.replaceAll("_", " ")}</td>
                <td>{event.actor_name}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
    </>)}
  </div>;
}

function Metric({ icon: Icon, label, value, hint, badge }: {
  icon: typeof Building2; label: string; value: string; hint: string; badge?: boolean;
}) {
  return <Card className="btb-console__metric">
    <span className="btb-console__metric-head"><Icon size={18} aria-hidden="true" />{label}{badge && <Badge accent="amber">Estimate</Badge>}</span>
    <strong>{value}</strong>
    <span className="btb-console__hint">{hint}</span>
  </Card>;
}

function HealthRow({ location, days }: { location: BtbAdminMonitoringLocation; days: number }) {
  const features = location.features.length
    ? location.features.map(feature => `${ENTITY_LABELS[feature.type] ?? feature.type} (${feature.count})`).join(" · ")
    : null;
  const problems = location.problems;
  const problemParts = [
    problems.failed_emails ? `${problems.failed_emails} email${problems.failed_emails === 1 ? "" : "s"}` : null,
    problems.failed_imports ? `${problems.failed_imports} import${problems.failed_imports === 1 ? "" : "s"}` : null,
    problems.changes_requested ? `${problems.changes_requested} hour${problems.changes_requested === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  const capacity = location.ai_daily_limit * days;
  const aiPercent = capacity ? Math.min(100, Math.round((location.ai_used / capacity) * 100)) : 0;
  const today = location.checks_complete + location.temperature_readings + location.sanitizer_readings;
  return <tr>
    <th scope="row">{location.name}{!location.active && <span className="btb-console__health-sub">Closed</span>}</th>
    <td>{location.last_activity ? when(location.last_activity) : <span className="btb-console__health-zero">—</span>}</td>
    <td>{location.busiest_hour === null ? <span className="btb-console__health-zero">—</span> : hourLabel(location.busiest_hour)}</td>
    <td>{features ?? <span className="btb-console__health-zero">—</span>}</td>
    <td>{location.open_entries || <span className="btb-console__health-zero">—</span>}</td>
    <td>{today === 0 ? <span className="btb-console__health-zero">—</span>
      : `${location.checks_complete} checks · ${location.temperature_readings} temps · ${location.sanitizer_readings} sanitizer`}</td>
    <td>{problems.total === 0 ? <span className="btb-console__health-zero">—</span>
      : <span className="btb-console__health-alert" title={location.latest_email_error ?? undefined}>
        {problems.total}<span className="btb-console__health-sub">{problemParts}</span>
      </span>}</td>
    <td>{location.ai_used === 0 ? <span className="btb-console__health-zero">—</span> : `${location.ai_used} · ${aiPercent}%`}</td>
    <td>{location.email_pending === 0 ? <span className="btb-console__health-zero">—</span> : `${location.email_pending} pending`}</td>
  </tr>;
}

function StorageRow({ location }: { location: BtbAdminMonitoringLocation }) {
  const percent = Math.min(100, Math.round((location.storage_bytes / location.storage_limit_bytes) * 100));
  const purposes = Object.entries(location.file_purposes)
    .filter(([, value]) => value.files > 0)
    .map(([purpose, value]) => `${purpose} ${value.files}`)
    .join(" · ");
  return <div className="btb-console__storage-row">
    <div className="btb-console__storage-name">
      <h3>{location.name} {!location.active && <Badge accent="red">Closed</Badge>}</h3>
      <p className="btb-console__hint">{location.files} {location.files === 1 ? "file" : "files"}{purposes ? ` · ${purposes}` : ""}</p>
    </div>
    <div className="btb-console__meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
    <p className="btb-console__storage-figure">{mb(location.storage_bytes)} of {mb(location.storage_limit_bytes)} · {percent}%</p>
  </div>;
}

function EmptyOverview() {
  return <Card className="btb-console__panel"><ShieldCheck size={28} aria-hidden="true" />
    <h2>Separate access. One familiar workspace.</h2>
    <p>Console accounts administer the group; invited employees use their own team credentials, and shared demo roles stay in the demo. No locations are managed yet.</p>
    <p>Add your first location to see its storage, people and activity here.</p>
    <Link className="btb-console__text-link" href="/btb/admin/locations">Add a location</Link>
  </Card>;
}
