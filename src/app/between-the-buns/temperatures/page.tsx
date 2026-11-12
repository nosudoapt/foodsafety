"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Printer, RefreshCw, Thermometer } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, PageHeader, TabList } from "@/components/ui";
import { jsonRequest, LoadState, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { attributionName, btbToday } from "@/lib/btb-team";
import {
  TEMPERATURE_SHEET_ROWS,
  TEMPERATURE_SHEET_SLOTS,
  TEMPERATURE_SHEET_SLOT_LABELS,
  parseTemperature,
  temperatureInRange,
  TEMPERATURE_TYPES,
  type BtbTemperatureRecord,
  type TemperatureSheetSlot,
} from "@/lib/btb-temperatures";

export default function TemperaturesPage() {
  return <BtbFeatureGate feature="temperatures">{(readOnly) => <TemperatureLog readOnly={readOnly} />}</BtbFeatureGate>;
}

interface SheetCellState { [key: string]: string }

/** The last N calendar dates, newest first — the 90-day rolling record window
 *  kept in view at all times per the client requirement. */
function lastDays(today: string, count = 90): string[] {
  const end = new Date(`${today}T12:00:00Z`).getTime();
  return Array.from({ length: count }, (_, index) => new Date(end - index * 86_400_000).toISOString().slice(0, 10));
}

function TemperatureLog({ readOnly }: { readOnly: boolean }) {
  const { data, loading, error, reload, update } = useBtbData<{ records: BtbTemperatureRecord[]; today: string }>("/api/btb/temperatures");
  const [tab, setTab] = useState<"sheet" | "history">("sheet");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [historyDay, setHistoryDay] = useState("");
  const today = data?.today ?? btbToday();
  const records = data?.records ?? [];

  // Sheet rows are keyed by (business_date, equipment_name, slot). Rows without
  // a business_date are the older free-form readings — they stay in history.
  const byDay = useMemo(() => {
    const map = new Map<string, BtbTemperatureRecord[]>();
    for (const record of records) {
      const date = record.business_date || btbToday(new Date(record.recorded_at));
      const list = map.get(date);
      if (list) list.push(record);
      else map.set(date, [record]);
    }
    return map;
  }, [records]);

  const [sheetDate, setSheetDate] = useState(today);
  const [drafts, setDrafts] = useState<SheetCellState>({});
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const savedCells = useMemo(() => {
    const map = new Map<string, BtbTemperatureRecord>();
    for (const record of byDay.get(sheetDate) ?? []) map.set(`${record.equipment_name}|${record.slot ?? ""}`, record);
    return map;
  }, [byDay, sheetDate]);
  const draftCount = Object.values(drafts).filter((value) => value.trim() !== "").length;
  const savedCount = savedCells.size;

  const setDraft = (key: string, value: string) => setDrafts((current) => ({ ...current, [key]: value }));
  const changeSheetDate = (date: string) => { setSheetDate(date); setDrafts({}); setSheetError(""); };

  const saveSheet = async () => {
    if (saving || readOnly) return;
    const cells = Object.entries(drafts)
      .filter(([, value]) => value.trim() !== "")
      .map(([key, value]) => {
        const [label, slot] = key.split("|");
        return { label, slot: slot as TemperatureSheetSlot, value };
      });
    if (!cells.length) { setSheetError("Write at least one reading on the sheet before saving."); return; }
    setSaving(true); setSheetError("");
    try {
      const result = await fetchJson<{ date: string; records: BtbTemperatureRecord[] }>("/api/btb/temperatures/sheet", jsonRequest({ date: sheetDate, cells }));
      const savedIds = new Set(result.records.map((record) => record.id));
      update((current) => ({ ...current, records: [...result.records, ...current.records.filter((record) => !savedIds.has(record.id))] }));
      setDrafts({});
      setNotice(`Sheet saved — ${result.records.length} reading${result.records.length === 1 ? "" : "s"} for ${result.date}.`);
    } catch (cause) {
      setSheetError(messageOf(cause));
    } finally { setSaving(false); }
  };

  return <div className="ops-workspace">
    <PageHeader title="Temperature Log" subtitle="The daily temp-check sheet, exactly as printed — freezers, coolers, line and sanitizer at 11:00 AM, 4:00 PM and 8:00 PM, with a saved 90-day rolling record." action={<span className="ops-toolbar-actions">
      <Button variant="ghost" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print sheet</Button>
      {!readOnly && <Button disabled={!data || !!error} onClick={() => setEditing(true)}><Plus size={18} aria-hidden="true" />Add off-form reading</Button>}
    </span>} />
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {readOnly && <p className="ops-meta">Read-only overview. Your restaurant team fills the sheet from their workspace.</p>}
    <div className="ops-tabs-row"><TabList id="temperature" label="Temperature records" value={tab} onChange={setTab} tabs={[{ id: "sheet", label: "Daily sheet" }, { id: "history", label: "History (90 days)" }]} /><Button variant="ghost" disabled={loading} onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh</Button></div>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && !error && tab === "sheet" && <section id="temperature-panel-sheet" role="tabpanel" aria-labelledby="temperature-tab-sheet" className="temperature-sheet-wrap">
      <div className="ops-toolbar">
        <label className="ops-inline-field">Sheet date
          <Input type="date" value={sheetDate} max={today} min={lastDays(today)[89]} onChange={(event) => changeSheetDate(event.target.value)} />
        </label>
        <p className="ops-meta">{savedCount} saved · {draftCount} ready to save{readOnly ? " · read-only" : ""}</p>
        {!readOnly && <Button disabled={saving || !!error} onClick={() => void saveSheet()}>{saving ? "Saving…" : "Save sheet"}</Button>}
      </div>
      {sheetError && <p className="ui-notice ui-notice--error" role="alert">{sheetError}</p>}
      <SheetTable
        date={sheetDate}
        onDateChange={changeSheetDate}
        maxDate={today}
        static={readOnly}
        cells={(label, slot) => {
          const saved = savedCells.get(`${label}|${slot}`);
          if (saved) return { saved: true, text: cellText(saved), unsafe: !saved.is_safe };
          if (readOnly) return { saved: false, text: "" };
          return { saved: false, text: drafts[`${label}|${slot}`] ?? "", draft: true };
        }}
        onDraft={(label, slot, value) => setDraft(`${label}|${slot}`, value)}
      />
      <p className="ops-meta">Standards printed on the form: freezers −24 to −18 °C · coolers 0 to 4 °C · SANTIZER 200–400 PPM. A box left empty stays empty — it is never recorded as a zero. Saved boxes are locked; correct a wrong reading with an off-form reading note.</p>
    </section>}
    {data && !error && tab === "history" && <section id="temperature-panel-history" role="tabpanel" aria-labelledby="temperature-tab-history" className="temperature-history">
      <div className="ops-toolbar"><p className="ops-meta">The last 90 days of daily sheets, exactly as saved.</p>
        <label className="ops-inline-field">Jump to date
          <Input type="date" value={historyDay} onChange={(event) => setHistoryDay(event.target.value)} />
          {historyDay && <Button variant="ghost" onClick={() => setHistoryDay("")}>Whole month</Button>}
        </label>
      </div>
      {lastDays(today).filter((date) => !historyDay || date === historyDay).map((date) => {
        const dayRecords = byDay.get(date) ?? [];
        return <Card key={date} className="temperature-history__day">
          <div className="temperature-reading__head"><div><Badge accent={dayRecords.length ? "purple" : "amber"}>{date}</Badge><h2>{date === today ? "Today" : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</h2><p>{dayRecords.length ? `${dayRecords.length} reading${dayRecords.length === 1 ? "" : "s"} saved` : "No readings recorded"}</p></div></div>
          <SheetTable
            date={date}
            static
            cells={(label, slot) => {
              const saved = (dayRecords.find((record) => record.equipment_name === label && (record.slot ?? "") === slot));
              if (saved) return { saved: true, text: cellText(saved), unsafe: !saved.is_safe };
              return { saved: false, text: "" };
            }}
          />
        </Card>;
      })}
    </section>}
    <details className="temperature-legacy"><summary>Looking for earlier Pholo records?</summary><p>Readings created under a Pholo account are available in that account’s Temperature Monitoring page.</p><Link href="/temperatures" className="ops-text-link">Open Pholo temperature records</Link><p className="ops-meta">Use the Pholo login that originally recorded them.</p></details>
    {editing && <ReadingForm onClose={() => setEditing(false)} onSaved={(record) => {
      update((current) => ({ ...current, records: [record, ...current.records.filter((item) => item.id !== record.id)] }));
      setEditing(false); setNotice("Temperature reading saved.");
    }} />}
  </div>;
}

function cellText(record: BtbTemperatureRecord): string {
  const value = `${record.temperature}`;
  return record.unit === "PPM" ? `${value} PPM` : `${value} °C`;
}

/** The printed temp-check form. Editable mode renders a bare input in each
 * labelled box; static mode (history/print) renders plain text, so the grid
 * prints like paper. Blank rows stay as empty handwriting rows either way. */
function SheetTable({ date, onDateChange, maxDate, static: isStatic, cells, onDraft }: {
  date: string;
  onDateChange?: (date: string) => void;
  maxDate?: string;
  static?: boolean;
  cells: (label: string, slot: TemperatureSheetSlot) => { saved: boolean; text: string; unsafe?: boolean; draft?: boolean };
  onDraft?: (label: string, slot: TemperatureSheetSlot, value: string) => void;
}) {
  return <div className="temperature-sheet-scroll">
    <table className="temperature-sheet">
      <tbody>
        <tr><th scope="col" rowSpan={2} className="temperature-sheet__label"></th><th scope="col" colSpan={3} className="temperature-sheet__head">TEMP CHECK</th></tr>
        <tr><th scope="col" colSpan={3} className="temperature-sheet__head temperature-sheet__date">
          {onDateChange && !isStatic
            ? <label className="temperature-sheet__date-field">DATE<input type="date" value={date} max={maxDate} onChange={(event) => onDateChange(event.target.value)} aria-label="Sheet date" /></label>
            : <span>DATE&nbsp;&nbsp;{date}</span>}
        </th></tr>
        <tr><th scope="col" className="temperature-sheet__label"></th>{TEMPERATURE_SHEET_SLOTS.map((slot) => <th key={slot} scope="col" className="temperature-sheet__head">{TEMPERATURE_SHEET_SLOT_LABELS[slot]}</th>)}</tr>
        {TEMPERATURE_SHEET_ROWS.map((row, index) => <tr key={`${row.label}-${index}`}>
          <th scope="row" className="temperature-sheet__label">{row.label}</th>
          {row.kind === "blank"
            ? TEMPERATURE_SHEET_SLOTS.map((slot) => <td key={slot} />)
            : TEMPERATURE_SHEET_SLOTS.map((slot) => {
              const state = cells(row.label, slot);
              const unit = row.kind === "sanitizer" ? "PPM" : "°C";
              return <td key={slot} className={state.unsafe ? "temperature-sheet__unsafe" : undefined}>
                {state.saved || isStatic
                  ? <span className="temperature-sheet__value">{state.text}</span>
                  : <span className="temperature-sheet__field">
                      <input
                        className="temperature-sheet__input"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={row.kind === "sanitizer" ? 0 : -273.15}
                        max={999.99}
                        aria-label={`${row.label} ${TEMPERATURE_SHEET_SLOT_LABELS[slot]} ${unit}`}
                        value={state.text}
                        onChange={(event) => onDraft?.(row.label, slot, event.target.value)}
                      />
                      <span className="temperature-sheet__unit" aria-hidden="true">{unit}</span>
                    </span>}
              </td>;
            })}
        </tr>)}
      </tbody>
    </table>
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
  return <Modal open title="Add temperature reading" description="Record a measured temperature outside the daily sheet — probes, deliveries, calibrations." busy={saving} onClose={onClose}><form onSubmit={submit}>
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
