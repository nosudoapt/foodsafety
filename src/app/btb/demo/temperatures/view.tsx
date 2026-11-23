"use client";
// Interactive view; page.tsx owns the request-time server gate.

import { useMemo, useState } from "react";
import { CircleAlert, Plus, Printer, RefreshCw, Thermometer } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, PageHeader, TabList } from "@/components/ui";
import { jsonRequest, LoadState, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { attributionName, btbToday } from "@/lib/btb-team";
import { compressImage, uploadToSupabase } from "@/lib/files";
import { photoSrc } from "@/lib/photos";
import {
  TEMPERATURE_SHEET_ROWS,
  TEMPERATURE_SHEET_SLOTS,
  TEMPERATURE_SHEET_SLOT_LABELS,
  TEMPERATURE_SHEET_FILLABLE,
  parseTemperature,
  temperatureAlert,
  temperatureInRange,
  TEMPERATURE_TYPES,
  type BtbTemperatureRecord,
  type TemperatureStandard,
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
  const { data, loading, error, reload, update } = useBtbData<{ records: BtbTemperatureRecord[]; standards: TemperatureStandard[]; today: string }>("/api/btb/temperatures");
  const { identity } = useBtbWorkspace();
  const [tab, setTab] = useState<"sheet" | "history">("sheet");
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [notice, setNotice] = useState("");
  const canManage = !!identity && ["manager", "owner", "corporate"].includes(identity.role);
  const [historyDay, setHistoryDay] = useState("");
  const today = data?.today ?? btbToday();
  const records = data?.records ?? [];
  const standards = data?.standards ?? [];

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
      {canManage && <Button variant="ghost" onClick={() => setManaging(true)}>Manage standards</Button>}
      {!readOnly && <Button disabled={!data || !!error} onClick={() => setEditing(true)}><Plus size={18} aria-hidden="true" />Add off-form reading</Button>}
    </span>} />
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {readOnly && <p className="ops-meta">Read-only overview. Your restaurant team fills the sheet from their workspace.</p>}
    {/* Off-form readings post against an operator-approved standard, and none
        are seeded on purpose (a guessed food-safety limit is a real risk).
        Say so plainly instead of leaving a silently disabled button. */}
    {data && !standards.length && !readOnly && <div className="ui-notice ui-notice--warning" role="status"><CircleAlert size={18} aria-hidden="true" /><div><strong>Off-form readings are not set up yet.</strong><p>The daily sheet below works and saves normally. {canManage ? <button className="link" onClick={() => setManaging(true)}>Approve your equipment standards</button> : "Ask your manager to approve the equipment standards"} before recording probe or delivery readings. Nothing is guessed on your behalf.</p></div></div>}
    {standards.length > 0 && <details className="temperature-legacy"><summary>{standards.length} approved temperature standard{standards.length === 1 ? "" : "s"}</summary><p className="ops-meta">{standards.map((standard) => `${standard.equipment_name} · ${TEMPERATURE_TYPES.find((item) => item.value === standard.record_type)?.label ?? standard.record_type} · ${standard.min_safe_temp} to ${standard.max_safe_temp} °C`).join(" · ")}</p></details>}
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
          const kind = TEMPERATURE_SHEET_FILLABLE.find((row) => row.label === label)?.kind;
          const saved = savedCells.get(`${label}|${slot}`);
          if (saved) {
            const alert = kind ? temperatureAlert(saved.temperature, kind) : saved.is_safe ? "ok" : "unsafe";
            return { saved: true, text: cellText(saved), unsafe: alert === "unsafe", warn: alert === "warn" };
          }
          if (readOnly) return { saved: false, text: "" };
          const text = drafts[`${label}|${slot}`] ?? "";
          const value = Number(text);
          // An in-range draft shows the same green as a saved reading, so the
          // operator can see a box is good before committing the sheet.
          const rated = kind && text.trim() !== "" && Number.isFinite(value);
          const alert = rated ? temperatureAlert(value, kind) : "ok";
          return { saved: false, text, draft: true, ok: rated && alert === "ok", unsafe: alert === "unsafe", warn: alert === "warn" };
        }}
        onDraft={(label, slot, value) => setDraft(`${label}|${slot}`, value)}
      />
      <p className="ops-meta">Standards printed on the form: coolers 1–3 °C green, 4 °C amber, above 4 °C red · freezers −18 °C or colder green, −17 to −12 °C amber, warmer than −12 °C red · sanitizer 200–400 PPM · temperature danger zone 4 °C to 60 °C. A box left empty stays empty — it is never recorded as a zero. Amber = above target but inside tolerance; red = out of range. Saved boxes are locked; correct a wrong reading with an off-form reading note.</p>
    </section>}
    {data && !error && tab === "history" && <section id="temperature-panel-history" role="tabpanel" aria-labelledby="temperature-tab-history" className="temperature-history">
      <div className="ops-toolbar"><p className="ops-meta">The last 90 days of daily sheets — tap a day to open its sheet.</p>
        <label className="ops-inline-field">Jump to date
          <Input type="date" value={historyDay} onChange={(event) => setHistoryDay(event.target.value)} />
          {historyDay && <Button variant="ghost" onClick={() => setHistoryDay("")}>Whole month</Button>}
        </label>
      </div>
      {lastDays(today).filter((date) => !historyDay || date === historyDay).map((date) => {
        const dayRecords = byDay.get(date) ?? [];
        const dayAlerts = dayRecords.map((record) => {
          const kind = TEMPERATURE_SHEET_FILLABLE.find((row) => row.label === record.equipment_name)?.kind;
          return kind ? temperatureAlert(record.temperature, kind) : record.is_safe ? "ok" : "unsafe";
        });
        const worst = dayAlerts.includes("unsafe") ? "unsafe" : dayAlerts.includes("warn") ? "warn" : dayRecords.length ? "ok" : "";
        return <Card key={date} className="temperature-history__day">
          <details open={date === historyDay}>
            <summary className="temperature-history__summary">
              <div>
                <Badge accent={worst === "unsafe" ? "red" : worst === "warn" ? "amber" : worst === "ok" ? "green" : "amber"}>{worst === "unsafe" ? "Out of range" : worst === "warn" ? "Watch" : worst === "ok" ? "All in range" : "No readings"}</Badge>
                <strong>{date === today ? "Today" : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</strong>
                <span className="temperature-history__meta">{date} · {dayRecords.length ? `${dayRecords.length} reading${dayRecords.length === 1 ? "" : "s"} saved` : "nothing recorded"}</span>
              </div>
              <span className="temperature-history__toggle" aria-hidden="true">Sheet ▾</span>
            </summary>
            <SheetTable
              date={date}
              static
              cells={(label, slot) => {
                const saved = (dayRecords.find((record) => record.equipment_name === label && (record.slot ?? "") === slot));
                if (saved) {
                  const kind = TEMPERATURE_SHEET_FILLABLE.find((row) => row.label === label)?.kind;
                  const alert = kind ? temperatureAlert(saved.temperature, kind) : saved.is_safe ? "ok" : "unsafe";
                  return { saved: true, text: cellText(saved), unsafe: alert === "unsafe", warn: alert === "warn" };
                }
                return { saved: false, text: "" };
              }}
            />
          </details>
        </Card>;
      })}
    </section>}
    {/* Cross product boundaries with a fresh document: BTB capabilities and a
        failed background FoodSafe profile load must not follow this link. */}
    <details className="temperature-legacy"><summary>Looking for earlier Pholo records?</summary><p>Readings created under a Pholo account are available in that account’s Temperature Monitoring page.</p><a href="/temperatures" className="ops-text-link">Open Pholo temperature records</a><p className="ops-meta">Use the Pholo login that originally recorded them.</p></details>
    {managing && <StandardsForm onClose={() => setManaging(false)} onSaved={() => { setManaging(false); setNotice("Temperature standard approved. Staff can now record readings against it."); void reload(); }} />}
    {editing && <ReadingForm standards={data?.standards ?? []} onClose={() => setEditing(false)} onSaved={(record) => {
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
  cells: (label: string, slot: TemperatureSheetSlot) => { saved: boolean; text: string; unsafe?: boolean; warn?: boolean; ok?: boolean; draft?: boolean };
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
              return <td key={slot} className={state.unsafe ? "temperature-sheet__unsafe" : state.warn ? "temperature-sheet__warn" : state.saved || state.ok ? "temperature-sheet__ok" : undefined}>
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

function StandardsForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ record_type: "cold_storage", equipment_name: "", min_safe_temp: "", max_safe_temp: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const min = Number(form.min_safe_temp), max = Number(form.max_safe_temp);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) { setError("Enter a valid safe range: the maximum must be at or above the minimum."); return; }
    setSaving(true); setError("");
    try {
      await fetchJson("/api/btb/temperature-standards", jsonRequest({
        record_type: form.record_type, equipment_name: form.equipment_name.trim(),
        min_safe_temp: min, max_safe_temp: max,
      }));
      onSaved();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title="Approve a temperature standard" description="These limits become the only values staff can use for off-form readings. Saving the same equipment again updates its range." busy={saving} onClose={onClose}><form onSubmit={submit}>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    <fieldset className="ui-form-stack" disabled={saving}>
      <label>Record type<select className="ui-input" data-modal-autofocus value={form.record_type} onChange={(event) => setForm({ ...form, record_type: event.target.value })}>{TEMPERATURE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Equipment / item<Input required maxLength={150} placeholder="Walk-in cooler, freezer, probe…" value={form.equipment_name} onChange={(event) => setForm({ ...form, equipment_name: event.target.value })} /></label>
      <div className="ops-form-grid">
        <label>Safe minimum °C<Input required type="number" step="0.01" value={form.min_safe_temp} onChange={(event) => setForm({ ...form, min_safe_temp: event.target.value })} /></label>
        <label>Safe maximum °C<Input required type="number" step="0.01" value={form.max_safe_temp} onChange={(event) => setForm({ ...form, max_safe_temp: event.target.value })} /></label>
      </div>
      <p className="ops-meta">Radius: every reading is green inside this range. Do not guess a food-safety limit — copy the approved local standard.</p>
    </fieldset>
    <div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Approving…" : "Approve standard"}</Button></div>
  </form></Modal>;
}

function ReadingForm({ standards, onClose, onSaved }: { standards: TemperatureStandard[]; onClose: () => void; onSaved: (record: BtbTemperatureRecord) => void }) {
  const { identity } = useBtbWorkspace();
  const [form, setForm] = useState(() => ({ id: crypto.randomUUID(), record_type: "cold_storage", equipment_name: "", food_item: "", temperature: "", min_safe_temp: "", max_safe_temp: "", notes: "" }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const choices = standards.filter((standard) => standard.record_type === form.record_type);
  const parsed = parseTemperature(form);
  const within = parsed.value && temperatureInRange(parsed.value.temperature, parsed.value.min_safe_temp, parsed.value.max_safe_temp);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (parsed.error) { setError(parsed.error); return; }
    setSaving(true); setError("");
    try { const result = await fetchJson<{ record: BtbTemperatureRecord }>("/api/btb/temperatures", jsonRequest({ ...parsed.value, photo_url: photoPath || null })); onSaved(result.record); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <Modal open title="Add temperature reading" description="Record a measured temperature outside the daily sheet — probes, deliveries, calibrations." busy={saving} onClose={onClose}><form onSubmit={submit}>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    <fieldset className="ui-form-stack" disabled={saving}>
      <label>Record type<select className="ui-input" value={form.record_type} onChange={(event) => setForm({ ...form, record_type: event.target.value, equipment_name: "", min_safe_temp: "", max_safe_temp: "" })}>{TEMPERATURE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label>Equipment<select required data-modal-autofocus className="ui-input" value={form.equipment_name} onChange={(event) => {
        const standard = choices.find((choice) => choice.equipment_name === event.target.value);
        setForm({ ...form, equipment_name: event.target.value, min_safe_temp: standard ? String(standard.min_safe_temp) : "", max_safe_temp: standard ? String(standard.max_safe_temp) : "" });
      }}><option value="">Choose approved equipment</option>{choices.map((standard) => <option key={standard.equipment_name} value={standard.equipment_name}>{standard.equipment_name}</option>)}</select></label>
      {!choices.length && <p className="ui-notice ui-notice--warning" role="status">No approved standard for this record type. Ask your manager to configure it before recording an off-form reading.</p>}
      <label>Food or storage item<Input required maxLength={150} placeholder="e.g. Dairy, freezer stock, cooked chicken" value={form.food_item} onChange={(event) => setForm({ ...form, food_item: event.target.value })} /></label>
      <label>Temperature (°C)<Input required type="number" step="0.01" min={-273.15} max={999.99} value={form.temperature} onChange={(event) => setForm({ ...form, temperature: event.target.value })} /></label>
      <div className="ops-form-grid"><label>Approved minimum (°C)<Input readOnly value={form.min_safe_temp} /></label><label>Approved maximum (°C)<Input readOnly value={form.max_safe_temp} /></label></div>
      {parsed.value && <p className={`ui-notice ${within ? "ui-notice--success" : "ui-notice--warning"}`} role="status">{within ? "Within the recorded target range." : "Outside the recorded target range. Record the corrective action below."}</p>}
      <label>Notes / corrective action <span>optional</span><textarea className="ui-input" rows={3} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <label>Photo evidence <span>optional</span><input type="file" accept="image/*" capture="environment" disabled={saving || uploading} onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        setUploading(true); setError("");
        try {
          const blob = await compressImage(file);
          const path = `temperature/${form.id}/${crypto.randomUUID()}.jpg`;
          await uploadToSupabase(path, blob);
          setPhotoPath(path);
        } catch (cause) { setError(cause instanceof Error ? `Photo upload failed: ${cause.message}` : "Photo upload failed."); }
        finally { setUploading(false); }
      }} /><small>Optional. A photo is attached to this reading only.</small></label>
      {uploading && <p className="ops-meta" role="status">Uploading photo…</p>}
      {photoPath && <p className="ops-meta"><a href={photoSrc(photoPath)} target="_blank" rel="noreferrer">View attached photo</a> · <button type="button" className="link" onClick={() => setPhotoPath("")}>Remove</button></p>}
      <p className="ops-meta">Recorded by: {identity ? attributionName(identity) : "your signed-in account"}. The saved time is added automatically.</p>
    </fieldset><div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !choices.length}>{saving ? "Saving…" : "Save reading"}</Button></div>
  </form></Modal>;
}
