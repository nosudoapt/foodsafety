"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, Save } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";

interface SettingsLocation {
  location_id: string;
  name: string;
  address: string | null;
  timezone: string;
  business_day_start: string;
  report_time: string | null;
  reports_enabled: boolean;
  reminders_enabled: boolean;
  manager_emails: string[];
  owner_emails: string[];
  additional_emails: string[];
  compliance_emails: string[];
  reminder_days: number[];
  compliance_types: string[];
  sales_basis: string;
  settings_confirmed: boolean;
  version: number;
  members: string[];
}

interface SettingsEmployee { id: string; name: string; email: string; role: string; active: boolean }

const TIMEZONES = [
  "America/Edmonton", "America/Regina", "America/Vancouver", "America/Winnipeg",
  "America/Toronto", "America/Halifax", "America/St_Johns", "America/New_York", "UTC",
];
const COMMON_TYPES = ["Food Handler", "First Aid", "WHMIS", "Driver's Licence", "Business Licence", "Insurance"];
const NEW = "new";

const listOf = (value: string): string[] =>
  value.split(/[\n,;]+/).map((row) => row.trim()).filter(Boolean);

export default function SettingsPage() {
  return <BtbFeatureGate feature="platform" wide>{(readOnly) => <SettingsWorkspace readOnly={readOnly} />}</BtbFeatureGate>;
}

function SettingsWorkspace({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<SettingsLocation[]>([]);
  const [employees, setEmployees] = useState<SettingsEmployee[]>([]);
  const [selected, setSelected] = useState(NEW);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setFailure("");
    try {
      const data = await fetchJson<{ locations: SettingsLocation[]; employees: SettingsEmployee[] }>("/api/btb/platform/read?module=settings");
      setRows(data.locations);
      setEmployees(data.employees);
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setLoading(false); }
  }, []);
  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; void load(); }, [load]);

  const current = rows.find((row) => row.location_id === selected) ?? null;

  return <div className="ops-workspace"><div className="btb-screen">
    <PageHeader
      title="Locations & settings"
      subtitle="Timezones, report time, recipients, and the approved local standards the daily record relies on."
    />
    <LoadState loading={loading} error={failure} onRetry={load} />
    {!loading && <Card><div className="ops-panel" aria-label="Choose location">
      <div className="ops-toolbar">
        <label className="ops-inline-field">Location
          <select className="ui-input" value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value={NEW}>Add a new location</option>
            {rows.map((row) => <option key={row.location_id} value={row.location_id}>{row.name}</option>)}
          </select>
        </label>
        {current && <Badge accent={current.settings_confirmed ? "green" : "amber"}>
          {current.settings_confirmed ? "Settings confirmed" : "Not confirmed"}
        </Badge>}
      </div>
      {notice && <p className="ui-notice ui-notice--success"><CheckCircle2 size={18} aria-hidden="true" /><span>{notice}</span></p>}
      {!readOnly && <SettingsForm
        key={`${selected}:${current?.version ?? 0}`}
        current={current}
        employees={employees}
        busy={busy}
        onSave={async (form) => {
          setBusy(true); setNotice(""); setFailure("");
          try {
            const saved = await fetchJson<{ location_id: string }>("/api/btb/platform/settings", jsonRequest({ form }));
            setNotice("Saved. Version increased - the daily record now uses these values.");
            await load();
            setSelected(saved.location_id);
          } catch (cause) { setFailure(messageOf(cause)); }
          finally { setBusy(false); }
        }}
      />}
    </div></Card>}
  </div></div>;
}

function SettingsForm({ current, employees, busy, onSave }: {
  current: SettingsLocation | null;
  employees: SettingsEmployee[];
  busy: boolean;
  onSave: (form: Record<string, unknown>) => Promise<void>;
}) {
  const isNew = !current;
  const [name, setName] = useState(current?.name ?? "");
  const [address, setAddress] = useState(current?.address ?? "");
  const [timezone, setTimezone] = useState(current?.timezone ?? "America/Edmonton");
  const [dayStart, setDayStart] = useState(current?.business_day_start ?? "04:00");
  const [reportTime, setReportTime] = useState(current?.report_time ?? "06:00");
  const [reports, setReports] = useState(current?.reports_enabled ?? false);
  const [reminders, setReminders] = useState(current?.reminders_enabled ?? true);
  const [manager, setManager] = useState((current?.manager_emails ?? []).join("\n"));
  const [owner, setOwner] = useState((current?.owner_emails ?? []).join("\n"));
  const [additional, setAdditional] = useState((current?.additional_emails ?? []).join("\n"));
  const [compliance, setCompliance] = useState((current?.compliance_emails ?? []).join("\n"));
  const [days, setDays] = useState((current?.reminder_days ?? [60, 30]).join(", "));
  const [types, setTypes] = useState((current?.compliance_types ?? []).join(", "));
  const [basis, setBasis] = useState(current?.sales_basis ?? "Summary Total Net Sales");
  const [members, setMembers] = useState<string[]>(current?.members ?? []);
  const [confirmed, setConfirmed] = useState(current?.settings_confirmed ?? false);

  return <form className="ops-form" onSubmit={(event) => {
    event.preventDefault();
    if (busy) return;
    void onSave({
      id: isNew ? "" : current.location_id,
      version: current?.version ?? 0,
      name: name.trim(),
      address: address.trim(),
      timezone,
      business_day_start: dayStart,
      report_time: reportTime,
      reports_enabled: reports,
      reminders_enabled: reminders,
      manager_emails: listOf(manager),
      owner_emails: listOf(owner),
      additional_emails: listOf(additional),
      compliance_emails: listOf(compliance),
      reminder_days: listOf(days).map(Number).filter((day) => Number.isInteger(day) && day > 0),
      compliance_types: listOf(types),
      sales_basis: basis.trim(),
      settings_confirmed: confirmed,
      members,
    });
  }}>
    <h2 className="ops-section-title">{isNew ? "New location" : `${name} · v${current.version}`}</h2>
    <div className="ops-form-grid">
      <label>Location name<Input value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></label>
      <label>Address<Input value={address} maxLength={300} onChange={(event) => setAddress(event.target.value)} /></label>
      <label>Timezone
        <select className="ui-input" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </label>
      <label>Business day starts<Input type="time" value={dayStart} onChange={(event) => setDayStart(event.target.value)} /></label>
      <label>Daily report time<Input type="time" value={reportTime} onChange={(event) => setReportTime(event.target.value)} /></label>
      <label>Sales basis label<Input value={basis} maxLength={80} onChange={(event) => setBasis(event.target.value)} /></label>
    </div>
    <div className="ops-form-grid">
      <label>Manager emails<textarea className="ui-input" rows={3} value={manager} onChange={(event) => setManager(event.target.value)} /></label>
      <label>Owner emails<textarea className="ui-input" rows={3} value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
      <label>Additional recipients<textarea className="ui-input" rows={3} value={additional} onChange={(event) => setAdditional(event.target.value)} /></label>
      <label>Compliance recipients<textarea className="ui-input" rows={3} value={compliance} onChange={(event) => setCompliance(event.target.value)} /></label>
    </div>
    <p className="ops-meta">One address per line, or comma separated. Empty lists mean no email is sent - no invented recipients.</p>
    <div className="ops-form-grid">
      <label>Reminder days<Input value={days} onChange={(event) => setDays(event.target.value)} /></label>
      <label>Compliance types<Input value={types} onChange={(event) => setTypes(event.target.value)} placeholder="Food Handler, First Aid" /></label>
    </div>
    <div className="ui-list">
      {COMMON_TYPES.filter((type) => !listOf(types).includes(type)).map((type) => <Button key={type} type="button" variant="ghost" onClick={() => setTypes([...listOf(types), type].join(", "))}><Plus size={14} aria-hidden="true" />{type}</Button>)}
    </div>
    <div className="ops-toolbar-actions">
      <label className="ops-inline-field"><input type="checkbox" checked={reports} onChange={(event) => setReports(event.target.checked)} />Daily reports</label>
      <label className="ops-inline-field"><input type="checkbox" checked={reminders} onChange={(event) => setReminders(event.target.checked)} />Expiry reminders</label>
      <label className="ops-inline-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm these settings are correct</label>
    </div>
    <fieldset>
      <legend>Assigned employees</legend>
      <div className="ui-list">
        {employees.filter((row) => row.active).map((row) => <label key={row.id} className="ops-inline-field">
          <input type="checkbox" checked={members.includes(row.id)} onChange={(event) => setMembers(event.target.checked ? [...members, row.id] : members.filter((id) => id !== row.id))} />
          {row.name}<span className="ops-meta">{row.role}</span>
        </label>)}
      </div>
    </fieldset>
    <Button type="submit" variant="soft" disabled={busy || name.trim().length < 2 || !reportTime}><Save size={16} aria-hidden="true" />{busy ? "Saving…" : isNew ? "Create location" : "Save settings"}</Button>
    <p className="ops-meta">Saving always increases the version; the scheduler only sends a location whose settings are confirmed.</p>
  </form>;
}
