"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, RefreshCw, Thermometer } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, PageHeader, TabList } from "@/components/ui";
import { jsonRequest, LoadState, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { attributionName, btbToday } from "@/lib/btb-team";
import { TEMPERATURE_TYPES, parseTemperature, temperatureInRange, type BtbTemperatureRecord } from "@/lib/btb-temperatures";

export default function TemperaturesPage() {
  return <BtbFeatureGate feature="temperatures">{(readOnly) => <TemperatureLog readOnly={readOnly} />}</BtbFeatureGate>;
}

function TemperatureLog({ readOnly }: { readOnly: boolean }) {
  const { data, loading, error, reload, update } = useBtbData<{ records: BtbTemperatureRecord[]; today: string }>("/api/btb/temperatures");
  const [tab, setTab] = useState<"today" | "history">("today");
  const [day, setDay] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const today = data?.today ?? btbToday();
  const records = data?.records ?? [];
  const visible = records.filter((record) => {
    const date = btbToday(new Date(record.recorded_at));
    return tab === "today" ? date === today : !day || date === day;
  });
  return <div className="ops-workspace">
    <PageHeader title="Temperature Log" subtitle="Food, fridge and freezer readings, with a saved 90-day history. All times are Saskatchewan time." action={!readOnly && <Button disabled={!data || !!error} onClick={() => setEditing(true)}><Plus size={18} aria-hidden="true" />Add reading</Button>} />
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {readOnly && <p className="ops-meta">Read-only overview. Your restaurant team records readings from their workspace.</p>}
    <div className="ops-tabs-row"><TabList id="temperature" label="Temperature records" value={tab} onChange={setTab} tabs={[{ id: "today", label: "Today’s readings" }, { id: "history", label: "History (90 days)" }]} /><Button variant="ghost" disabled={loading} onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh history</Button></div>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && !error && <section id={`temperature-panel-${tab}`} role="tabpanel" aria-labelledby={`temperature-tab-${tab}`} className="temperature-history">
      <div className="ops-toolbar"><p className="ops-meta">{visible.length} saved reading{visible.length === 1 ? "" : "s"}{tab === "today" ? ` · ${today}` : ""}</p>{tab === "history" && <label className="ops-inline-field">Filter by date<Input type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} />{day && <Button variant="ghost" onClick={() => setDay("")}>All dates</Button>}</label>}</div>
      {visible.length ? visible.map((record) => <article key={record.id} className="temperature-reading" aria-label={`${record.equipment_name} · ${record.food_item}`}>
        <div className="temperature-reading__head"><div><Badge accent="purple">{TEMPERATURE_TYPES.find((type) => type.value === record.record_type)?.label ?? record.record_type}</Badge><h2>{record.equipment_name}</h2><p>{record.food_item}</p></div><div className="temperature-reading__value"><strong>{record.temperature}°C</strong><Badge accent={record.is_safe ? "green" : "red"}>{record.is_safe ? "Within target" : "Outside target"}</Badge></div></div>
        <p className="ops-meta">Recorded target: {record.min_safe_temp} to {record.max_safe_temp}°C · <time dateTime={record.recorded_at}>{new Date(record.recorded_at).toLocaleString("en-CA", { timeZone: "America/Regina", dateStyle: "medium", timeStyle: "short" })}</time></p>
        {record.notes && <p className="temperature-reading__notes">{record.notes}</p>}
      </article>) : <Card><div className="ui-empty"><Thermometer size={28} aria-hidden="true" /><h2>{tab === "today" ? "No readings saved today" : "No readings for this period"}</h2><p>{readOnly ? "Saved team readings will appear here." : "Add a reading to record the temperature, target range and any corrective action."}</p></div></Card>}
    </section>}
    <details className="temperature-legacy"><summary>Looking for earlier FoodSafe records?</summary><p>Readings created under a FoodSafe account are available in that account’s Temperature Monitoring page.</p><Link href="/temperatures" className="ops-text-link">Open FoodSafe temperature records</Link><p className="ops-meta">Use the FoodSafe login that originally recorded them.</p></details>
    {editing && <ReadingForm onClose={() => setEditing(false)} onSaved={(record) => {
      update((current) => ({ ...current, today: btbToday(new Date(record.recorded_at)), records: [record, ...current.records.filter((item) => item.id !== record.id)] }));
      setEditing(false); setNotice("Temperature reading saved."); setTab("today");
    }} />}
  </div>;
}

function ReadingForm({ onClose, onSaved }: { onClose: () => void; onSaved: (record: BtbTemperatureRecord) => void }) {
  const { identity } = useBtbWorkspace();
  const [form, setForm] = useState(() => ({ id: crypto.randomUUID(), record_type: "cold_storage", equipment_name: "", food_item: "", temperature: "", min_safe_temp: "", max_safe_temp: "", notes: "" }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const parsed = parseTemperature(form);
  const within = parsed.value && temperatureInRange(parsed.value.temperature, parsed.value.min_safe_temp, parsed.value.max_safe_temp);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (parsed.error) { setError(parsed.error); return; }
    setSaving(true); setError("");
    try { const result = await fetchJson<{ record: BtbTemperatureRecord }>("/api/btb/temperatures", jsonRequest(parsed.value)); onSaved(result.record); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title="Add temperature reading" description="Record the measured temperature and the target range from your kitchen’s procedure." busy={saving} onClose={onClose}><form onSubmit={submit}>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    <fieldset className="ui-form-stack" disabled={saving}>
      <label>Record type<select className="ui-input" value={form.record_type} onChange={(event) => setForm({ ...form, record_type: event.target.value })}>{TEMPERATURE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label>Equipment<Input required data-modal-autofocus maxLength={150} placeholder="e.g. Walk-in fridge" value={form.equipment_name} onChange={(event) => setForm({ ...form, equipment_name: event.target.value })} /></label>
      <label>Food or storage item<Input required maxLength={150} placeholder="e.g. Dairy, freezer stock, cooked chicken" value={form.food_item} onChange={(event) => setForm({ ...form, food_item: event.target.value })} /></label>
      <label>Temperature (°C)<Input required type="number" step="0.01" min={-273.15} max={999.99} value={form.temperature} onChange={(event) => setForm({ ...form, temperature: event.target.value })} /></label>
      <div className="ops-form-grid"><label>Target minimum (°C)<Input required type="number" step="0.01" min={-273.15} max={999.99} value={form.min_safe_temp} onChange={(event) => setForm({ ...form, min_safe_temp: event.target.value })} /></label><label>Target maximum (°C)<Input required type="number" step="0.01" min={-273.15} max={999.99} value={form.max_safe_temp} onChange={(event) => setForm({ ...form, max_safe_temp: event.target.value })} /></label></div>
      {parsed.value && <p className={`ui-notice ${within ? "ui-notice--success" : "ui-notice--warning"}`} role="status">{within ? "Within the recorded target range." : "Outside the recorded target range. Record the corrective action below."}</p>}
      <label>Notes / corrective action <span>optional</span><textarea className="ui-input" rows={3} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <p className="ops-meta">Recorded by: {identity ? attributionName(identity) : "your signed-in account"}. The saved time is added automatically.</p>
    </fieldset><div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save reading"}</Button></div>
  </form></Modal>;
}
