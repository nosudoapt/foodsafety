"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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

interface SettingsEmployee { id: string; name: string; email: string; phone: string; position: string | null; role: string; active: boolean; version: number }

const TIMEZONES = [
  "America/Edmonton", "America/Regina", "America/Vancouver", "America/Winnipeg",
  "America/Toronto", "America/Halifax", "America/St_Johns", "America/New_York", "UTC",
];
const COMMON_TYPES = ["Food Handler", "First Aid", "WHMIS", "Driver's Licence", "Business Licence", "Insurance"];
const NEW = "new";

const listOf = (value: string): string[] =>
  value.split(/[\n,;]+/).map((row) => row.trim()).filter(Boolean);

export default function SettingsPage() {
  return <BtbFeatureGate feature="platform" wide>{(readOnly, role) => <SettingsWorkspace readOnly={readOnly} role={role} />}</BtbFeatureGate>;
}

function SettingsWorkspace({ readOnly, role }: { readOnly: boolean; role: string }) {
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
  // The SQL boundary is the authority: the 'settings' capability is
  // corporate/owner only (schema-btb-platform-foundation.sql), so the forms are
  // shown to exactly the roles whose saves can succeed.
  const canConfigure = role === "owner" || role === "corporate";

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
      {canConfigure && <SettingsForm
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
      {!canConfigure && <p className="ui-empty">Location settings are configured by corporate or the owner. You can view the values above.</p>}
    </div></Card>}
    {!loading && canConfigure && current && <AiSettingsCard locationId={current.location_id} locationName={current.name} />}
    {!loading && canConfigure && <TeamCard employees={employees} onChanged={load} />}
  </div></div>;
}

interface TeamForm { id: string | null; version: number; name: string; email: string; phone: string; position: string; role: string; active: boolean; password: string }

/**
 * Team card: add employees, deactivate/reactivate them, and point at the
 * staff-certificate reminder recipients. Deletion is deliberately absent —
 * BTB treats records as audit history, so "remove employee" means
 * deactivated (their logins stop working immediately).
 */
function TeamCard({ employees, onChanged }: { employees: SettingsEmployee[]; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SettingsEmployee | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState("staff");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const startEdit = (row: SettingsEmployee | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setEmail(row?.email ?? "");
    setPhone(row?.phone ?? "");
    setPosition(row?.position ?? "");
    setRole(row?.role ?? "staff");
    setPassword("");
    setOpen(true); setNotice(""); setFailure("");
  };
  const close = () => { setOpen(false); setEditing(null); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/employees", jsonRequest({
        id: editing?.id ?? null,
        version: editing?.version ?? 0,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        position: position.trim(),
        role,
        active: editing?.active ?? true,
        ...(password.trim() ? { password: password.trim() } : {}),
      } as Record<string, unknown>));
      setNotice(editing ? `${name.trim()} updated. Existing logins end on their next request.` : `${name.trim()} added to the team.`);
      await onChanged();
      close();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const setActive = async (row: SettingsEmployee, active: boolean) => {
    if (busy) return;
    setBusy(true); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/employees", jsonRequest({
        id: row.id, version: row.version,
        name: row.name, email: row.email, phone: row.phone,
        position: row.position ?? "", role: row.role, active,
      } as Record<string, unknown>));
      setNotice(`${row.name} ${active ? "reactivated" : "deactivated"}.`);
      await onChanged();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(false); }
  };

  return <Card><div className="ops-panel" aria-label="Team and certificate reminders">
    <div className="ops-toolbar">
      <div>
        <h3>Team & certificate reminders</h3>
        <p className="ops-meta">
          Add team members, give them a login, or deactivate one — records are never deleted.
          Staff certificate expiry reminders go to the manager and owner addresses set in{" "}
          <a href="/between-the-buns/licence-reminders">Licence Reminders</a>.
        </p>
      </div>
      {!open && <Button variant="soft" onClick={() => startEdit(null)}><Plus size={16} aria-hidden="true" />Add employee</Button>}
    </div>
    <div className="ui-list">
      {employees.map((row) => <div key={row.id} className="ops-toolbar">
        <span><strong>{row.name}</strong><span className="ops-meta"> · {row.email} · {row.role}</span></span>
        <span className="ops-toolbar-actions">
          <Badge accent={row.active ? "green" : "slate"}>{row.active ? "Active" : "Deactivated"}</Badge>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => startEdit(row)}>Edit</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void setActive(row, !row.active)}>
            {row.active ? "Deactivate" : "Reactivate"}
          </Button>
        </span>
      </div>)}
      {!employees.length && <p className="ui-empty">No team members yet.</p>}
    </div>
    {open && <form className="ops-form" onSubmit={submit}>
      <h3 className="ops-section-title">{editing ? `Edit ${editing.name}` : "New employee"}</h3>
      <div className="ops-form-grid">
        <label>Name<Input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label>Email{!editing && <span className="ops-meta"> (their login)</span>}<Input type="email" value={email} required maxLength={120} autoCapitalize="none" onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Phone<Input value={phone} required maxLength={40} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>Position<Input value={position} maxLength={100} onChange={(event) => setPosition(event.target.value)} /></label>
        <label>Role
          <select className="ui-input" value={role} onChange={(event) => setRole(event.target.value)}>
            {["staff", "supervisor", "manager", "designer", "corporate", "owner"].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>{editing ? "New password (blank = unchanged)" : "Initial password"}<Input type="password" value={password} autoComplete="new-password" maxLength={128} onChange={(event) => setPassword(event.target.value)} /></label>
      </div>
      {!editing && <p className="ops-meta">Initial password must be at least 10 characters. The team member changes it after first sign-in.</p>}
      <div className="ops-toolbar-actions">
        <Button type="submit" variant="soft" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Save employee"}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
      </div>
      {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
      {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    </form>}
  </div></Card>;
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

interface AiSettings {
  enabled: boolean;
  model: string | null;
  has_key: boolean;
  api_key_masked: string;
  daily_limit: number;
  version: number;
}

/**
 * AI document extraction: bring-your-own OpenAI-compatible key, stored in the
 * private settings table and never returned to the browser (a masked tail
 * only). Without a key the inventory scanner simply stays in hand-entry mode.
 */
function AiSettingsCard({ locationId, locationName }: { locationId: string; locationName: string }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [limit, setLimit] = useState("25");

  const load = useCallback(async () => {
    setLoading(true); setFailure("");
    try {
      const data = await fetchJson<{ settings: AiSettings }>(`/api/btb/platform/ai-settings?location=${locationId}`);
      setSettings(data.settings);
      setEnabled(data.settings.enabled);
      setModel(data.settings.model ?? "");
      setLimit(String(data.settings.daily_limit));
      setApiKey("");
      setRemoveKey(false);
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setLoading(false); }
  }, [locationId]);
  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; void load(); }, [load]);

  const save = async () => {
    if (busy) return;
    setBusy(true); setFailure(""); setNotice("");
    try {
      const data = await fetchJson<{ settings: AiSettings }>("/api/btb/platform/ai-settings", jsonRequest({
        location_id: locationId,
        form: {
          enabled,
          model: model.trim(),
          api_key: apiKey.trim(),
          remove_key: removeKey,
          daily_limit: Number(limit),
          version: settings?.version ?? 0,
        },
      }));
      setSettings(data.settings);
      setEnabled(data.settings.enabled);
      setModel(data.settings.model ?? "");
      setLimit(String(data.settings.daily_limit));
      setApiKey("");
      setRemoveKey(false);
      setNotice(data.settings.has_key
        ? "Saved. The scanner can now draft values from uploaded documents."
        : "Saved. Without a key the scanner stays in hand-entry mode.");
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(false); }
  };

  return <Card><div className="ops-panel" aria-label="AI document extraction">
    <div className="ops-toolbar">
      <div>
        <h3>AI document extraction — {locationName}</h3>
        <p className="ops-meta">
          Drafts invoice, receipt and sales figures for the review queue. A person always confirms before
          anything is recorded. Bring your own OpenAI-compatible API key; it is stored privately and shown
          only masked. Usage is capped per day.
        </p>
      </div>
      <Badge accent={settings?.enabled && settings?.has_key ? "green" : "slate"}>
        {settings?.enabled && settings?.has_key ? "Operational" : "Hand-entry only"}
      </Badge>
    </div>
    <LoadState loading={loading} error={failure} onRetry={load} />
    {!loading && <div className="ops-form-grid">
      <label className="ops-inline-field"><input type="checkbox" checked={enabled} disabled={busy}
        onChange={(event) => setEnabled(event.target.checked)} />Enable AI drafting for this location</label>
      <label>Model (blank = provider default)<Input value={model} disabled={busy} maxLength={100}
        placeholder="e.g. gpt-4o-mini" onChange={(event) => setModel(event.target.value)} /></label>
      <label>Daily extraction limit<Input value={limit} disabled={busy} inputMode="numeric"
        onChange={(event) => setLimit(event.target.value)} /></label>
      <label>{settings?.has_key ? "Replace API key" : "API key"}{settings?.has_key && <span className="ops-meta"> current: {settings.api_key_masked}</span>}
        <Input type="password" value={apiKey} disabled={busy || removeKey} autoComplete="off"
          placeholder={settings?.has_key ? "Leave blank to keep the saved key" : "sk-…"}
          onChange={(event) => setApiKey(event.target.value)} /></label>
      {settings?.has_key && <label className="ops-inline-field"><input type="checkbox" checked={removeKey} disabled={busy}
        onChange={(event) => setRemoveKey(event.target.checked)} />Remove the saved key</label>}
    </div>}
    {!loading && <div className="ops-toolbar">
      <Button variant="soft" disabled={busy || (!removeKey && settings?.has_key && apiKey.trim() === "" && enabled === settings.enabled && model === (settings.model ?? "") && Number(limit) === settings.daily_limit)} onClick={() => void save()}>
        <Save size={16} aria-hidden="true" />{busy ? "Saving…" : "Save AI settings"}
      </Button>
      {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      {failure && !loading && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
    </div>}
  </div></Card>;
}
