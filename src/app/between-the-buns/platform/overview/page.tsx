"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, RefreshCw } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { btbToday, isIsoDate } from "@/lib/btb-team";
import { btbMonth, shiftMonth, monthLabel } from "@/lib/btb-platform-inventory";

export interface OverviewLocation {
  id: string;
  name: string;
  timezone: string | null;
  settings_confirmed: boolean;
  checks_complete: number;
  temperature_readings: number;
  sanitizer_readings: number;
  pending_approvals: number;
  designs_in_progress: number;
  expiring: number;
  expired: number;
  missing: number;
  email_accepted: number;
  email_failed: number;
  inventory: { status: string; cogs?: number | null; food_cost_pct?: number | null } | null;
}

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export default function OverviewPage() {
  return <BtbFeatureGate feature="platform" wide>{(readOnly) => <Overview readOnly={readOnly} />}</BtbFeatureGate>;
}

function Overview({ readOnly }: { readOnly: boolean }) {
  const [date, setDate] = useState(() => btbToday());
  const [month, setMonth] = useState(() => btbMonth());
  const overview = useBtbData<{ locations: OverviewLocation[] }>(`/api/btb/platform/overview?date=${date}&month=${month}`);
  const rows = overview.data?.locations ?? null;
  const loading = overview.loading;
  const failure = overview.error;
  const load = overview.reload;

  const total = (pick: (row: OverviewLocation) => number) => (rows ?? []).reduce((sum, row) => sum + pick(row), 0);

  return <div className="ops-workspace">
    <div className="btb-screen">
      <PageHeader
        title="Corporate overview"
        subtitle="Every active location at a glance: daily record coverage, promotions awaiting approval, certificates expiring, and delivered reports."
        action={<Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Refresh</Button>}
      />
      <section className="ops-shell">
        <div className="ops-toolbar">
          <div className="ops-date-nav">
            <Button variant="ghost" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={18} aria-hidden="true" /></Button>
            <label className="ops-inline-field">Business date <Input type="date" value={date} max={btbToday()} onChange={(event) => { if (isIsoDate(event.target.value)) setDate(event.target.value); }} /></label>
            <Button variant="ghost" aria-label="Next day" disabled={date >= btbToday()} onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={18} aria-hidden="true" /></Button>
            <Button variant="soft" onClick={() => setDate(btbToday())}>Today</Button>
          </div>
          <div className="ops-date-nav">
            <Button variant="ghost" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} aria-hidden="true" /></Button>
            <p className="ops-inline-field"><strong>{monthLabel(month)}</strong></p>
            <Button variant="ghost" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} aria-hidden="true" /></Button>
            <Button variant="soft" onClick={() => setMonth(btbMonth())}>This month</Button>
          </div>
        </div>
        <LoadState loading={loading} error={failure} onRetry={load} />
      </section>
      {rows && <Card><div className="ops-panel">
        <table className="ui-table">
          <caption>Location summary</caption>
          <thead><tr><th scope="col">Location</th><th scope="col">Daily checks</th><th scope="col">Readings</th><th scope="col">Marketing</th><th scope="col">Certificates</th><th scope="col">Reports</th><th scope="col">Food cost {monthLabel(month)}</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const shortages = !!row.inventory && row.inventory.status !== "finalized";
              return <tr key={row.id}>
                <td><p className="ui-row-title">{row.name}</p><p className="ops-meta">{row.timezone ?? "No timezone"} {!row.settings_confirmed && "· settings not confirmed"}</p></td>
                <td><Badge accent={row.checks_complete === 3 ? "green" : row.checks_complete ? "amber" : "amber"}>{row.checks_complete}/3 {row.checks_complete === 3 ? "done" : "incomplete"}</Badge></td>
                <td><p className="ops-meta">{row.temperature_readings} temperature · {row.sanitizer_readings} sanitizer</p></td>
                <td><p className="ops-meta">{row.pending_approvals} awaiting approval · {row.designs_in_progress} in production</p></td>
                <td>
                  {row.expired > 0 && <Badge accent="red">{row.expired} expired</Badge>}
                  {row.expiring > 0 && <Badge accent="amber">{row.expiring} within 60d</Badge>}
                  {row.missing > 0 && <Badge accent="red">{row.missing} incomplete</Badge>}
                  {!row.expired && !row.expiring && !row.missing && <Badge accent="green">No expiries</Badge>}
                </td>
                <td><p className="ops-meta">{row.email_accepted} sent · {row.email_failed} failed</p></td>
                <td>{shortages
                  ? <span className="ops-meta">Not finalised</span>
                  : <p className="ui-row-title">{row.inventory?.cogs != null ? moneyish(row.inventory.cogs) : "Missing"} · {row.inventory?.food_cost_pct != null ? `${row.inventory.food_cost_pct.toFixed(2)}%` : "Missing"}</p>}
                </td>
              </tr>;
            })}
          </tbody>
          <tfoot><tr>
            <th scope="row">Total ({rows.length} locations)</th>
            <td className="ops-meta">{total((row) => row.checks_complete)} checks</td>
            <td className="ops-meta">{total((row) => row.temperature_readings)} + {total((row) => row.sanitizer_readings)}</td>
            <td className="ops-meta">{total((row) => row.pending_approvals)} pending · {total((row) => row.designs_in_progress)} active</td>
            <td className="ops-meta">{total((row) => row.expired)} expired · {total((row) => row.expiring)} expiring</td>
            <td className="ops-meta">{total((row) => row.email_failed)} failed</td>
            <td />
          </tr></tfoot>
        </table>
        <p className="ops-meta"><AlertTriangle size={14} aria-hidden="true" /> Unfinalised food cost is deliberately blank, never shown as zero.</p>
      </div></Card>}
      <Card><div className="ops-panel">
        <div className="ops-toolbar">
          <div><h2 className="ops-section-title">Location settings</h2>
            <p className="ops-meta">Timezones, report time, recipients, equipment, sanitizer standard and compliance types.</p></div>
          {!readOnly && rows && <Link className="ui-button ui-button--soft" href="/between-the-buns/platform/settings"><MapPin size={16} aria-hidden="true" />Open location settings</Link>}
        </div>
      </div></Card>
    </div>
  </div>;
}

function moneyish(value: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
}
