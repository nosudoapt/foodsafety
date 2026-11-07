"use client";

import { useState } from "react";
import { Droplets, Save, Thermometer } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";
import { READING_SLOTS } from "@/lib/btb-platform";

export interface PlatformEquipment {
  id: string;
  name: string;
  slots: string[];
}

export interface PlatformTemperature {
  id: string;
  equipment_id?: string | null;
  equipment_name?: string | null;
  slot: string;
  temperature?: number | null;
  min_safe_temp?: number | null;
  max_safe_temp?: number | null;
  is_safe?: boolean | null;
  recorded_by_name?: string | null;
  notes?: string | null;
  version: number;
}

export interface PlatformSanitizer {
  id: string;
  slot: string;
  ppm?: number | null;
  min_ppm?: number | null;
  max_ppm?: number | null;
  is_safe?: boolean | null;
  recorded_by_name?: string | null;
  notes?: string | null;
  version: number;
}

interface ReadingData {
  business_date?: string;
  equipment: PlatformEquipment[];
  temperatures: PlatformTemperature[];
  sanitizer: PlatformSanitizer[];
  sanitizer_slots: string[];
  sanitizer_settings: { chemical: string; min_ppm: number | null; max_ppm: number | null } | null;
}

export default function ReadingsPanel({ readOnly, date, locationId, data, reload }: {
  readOnly: boolean;
  date: string;
  locationId: string;
  data: ReadingData;
  reload: () => void;
}) {
  return <section className="ops-panel" aria-label="Food safety readings">
    <div>
      <h2 className="ops-section-title">Scheduled temperature &amp; sanitizer readings</h2>
      <p className="ops-meta">{date} · Celsius equipment checks at the three configured times, plus a separate sanitizer PPM log. A blank reading is never saved as zero.</p>
    </div>
    <div className="ops-reading-grid">
      <TemperatureCard readOnly={readOnly} date={date} locationId={locationId} data={data} reload={reload} />
      <SanitizerCard readOnly={readOnly} date={date} locationId={locationId} data={data} reload={reload} />
    </div>
  </section>;
}

function TemperatureCard({ readOnly, date, locationId, data, reload }: {
  readOnly: boolean;
  date: string;
  locationId: string;
  data: ReadingData;
  reload: () => void;
}) {
  const [equipmentId, setEquipmentId] = useState(data.equipment[0]?.id ?? "");
  const [slot, setSlot] = useState<string>(READING_SLOTS[0]);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pick = (nextEquipment: string, nextSlot: string) => {
    const row = data.temperatures.find((entry) => (entry.equipment_id ?? null) === nextEquipment && entry.slot === nextSlot) ?? null;
    setEquipmentId(nextEquipment);
    setSlot(nextSlot);
    setValue(row?.temperature == null ? "" : String(row.temperature));
    setNotes(row?.notes ?? "");
    setVersion(row?.version ?? 0);
    setError("");
    setNotice("");
  };

  const save = async () => {
    if (saving || !equipmentId || !value.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/reading", jsonRequest({
        location_id: locationId,
        kind: "temperature",
        date,
        slot,
        value,
        version,
        notes,
        equipment_id: equipmentId,
      }));
      setNotice(`Celsius reading saved for ${slot}.`);
      reload();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };

  const slotsForEquipment = data.equipment.find((row) => row.id === equipmentId)?.slots ?? [...READING_SLOTS];

  return <Card><div className="ops-panel">
    <h3><Thermometer size={18} aria-hidden="true" /> Celsius equipment readings</h3>
    {!data.equipment.length && <p className="ui-notice">No equipment has been configured for this location yet. Ask a manager to add the coolers and freezers with their approved Celsius limits.</p>}
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {data.equipment.map((equipment) => <div key={equipment.id} className="ops-equipment">
      <p className="ops-meta"><strong>{equipment.name}</strong></p>
      <div className="ops-slot-list">
        {(equipment.slots ?? []).map((entry) => {
          const saved = data.temperatures.find((row) => (row.equipment_id ?? null) === equipment.id && row.slot === entry) ?? null;
          const limit = saved?.min_safe_temp != null && saved?.max_safe_temp != null
            ? `${saved.min_safe_temp}–${saved.max_safe_temp}°C` : "No approved limit set";
          return <button type="button" key={entry} className={`ops-slot ops-slot--button ${entry === slot && equipment.id === equipmentId ? "ops-slot--selected" : ""}`}
            onClick={() => pick(equipment.id, entry)}>
            <span>{entry}</span>
            {saved ? <Badge accent={saved.is_safe === true ? "green" : saved.is_safe === false ? "red" : "slate"}>
              {saved.temperature == null ? "Missing" : `${saved.temperature}°C`}
            </Badge> : <Badge accent="slate">Not recorded</Badge>}
            <small className="ops-meta">{limit}{saved?.recorded_by_name ? ` · ${saved.recorded_by_name}` : ""}</small>
          </button>;
        })}
      </div>
    </div>)}
    {!readOnly && data.equipment.length > 0 && <div className="ops-form-card">
      <h4>Record a Celsius reading</h4>
      <div className="ops-form-grid">
        <label>Equipment<select className="ui-input" value={equipmentId} disabled={saving}
          onChange={(event) => pick(event.target.value, slot)}>
          {data.equipment.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <label>Scheduled check<select className="ui-input" value={slot} disabled={saving}
          onChange={(event) => pick(equipmentId, event.target.value)}>
          {slotsForEquipment.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select></label>
        <label>Temperature (°C)<Input inputMode="decimal" value={value} disabled={saving}
          onChange={(event) => setValue(event.target.value)} placeholder="e.g. 3.1" /></label>
        <label>Notes<Input value={notes} disabled={saving}
          onChange={(event) => setNotes(event.target.value)} placeholder="Corrective action, if any" /></label>
      </div>
      <Button disabled={saving || !value.trim()} onClick={save}><Save size={16} aria-hidden="true" />{saving ? "Saving…" : "Save Celsius reading"}</Button>
    </div>}
  </div></Card>;
}

function SanitizerCard({ readOnly, date, locationId, data, reload }: {
  readOnly: boolean;
  date: string;
  locationId: string;
  data: ReadingData;
  reload: () => void;
}) {
  const slots = data.sanitizer_slots?.length ? data.sanitizer_slots : [...READING_SLOTS];
  const [slot, setSlot] = useState<string>(slots[0]);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saved = data.sanitizer.find((row) => row.slot === slot) ?? null;
  const range = data.sanitizer_settings;
  const approved = range && range.min_ppm != null && range.max_ppm != null;

  const pick = (nextSlot: string) => {
    const row = data.sanitizer.find((entry) => entry.slot === nextSlot) ?? null;
    setSlot(nextSlot);
    setValue(row?.ppm == null ? "" : String(row.ppm));
    setNotes(row?.notes ?? "");
    setVersion(row?.version ?? 0);
    setError("");
    setNotice("");
  };

  const save = async () => {
    if (saving || !value.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/reading", jsonRequest({
        location_id: locationId,
        kind: "sanitizer",
        date,
        slot,
        value,
        version,
        notes,
      }));
      setNotice(`Sanitizer PPM saved for ${slot}.`);
      reload();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };

  return <Card><div className="ops-panel">
    <h3><Droplets size={18} aria-hidden="true" /> Sanitizer concentration</h3>
    <p className="ops-meta">
      {range?.chemical ? `${range.chemical} · ` : ""}
      {approved ? `Approved ${range!.min_ppm}–${range!.max_ppm} PPM` : "No approved PPM range has been set for this location. Readings are recorded without a safety judgement."}
    </p>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    <div className="ops-slot-list">
      {slots.map((entry) => {
        const row = data.sanitizer.find((item) => item.slot === entry) ?? null;
        return <button type="button" key={entry} className={`ops-slot ops-slot--button ${entry === slot ? "ops-slot--selected" : ""}`}
          onClick={() => pick(entry)}>
          <span>{entry}</span>
          {row ? <Badge accent={row.is_safe === true ? "green" : row.is_safe === false ? "red" : "slate"}>
            {row.ppm == null ? "Missing" : `${row.ppm} PPM`}
          </Badge> : <Badge accent="slate">Not recorded</Badge>}
        </button>;
      })}
    </div>
    {saved?.recorded_by_name && <p className="ops-meta">Last recorded by {saved.recorded_by_name}</p>}
    {!readOnly && <div className="ops-form-card">
      <h4>Record a sanitizer reading</h4>
      <div className="ops-form-grid">
        <label>Sanitizer PPM<Input inputMode="decimal" value={value} disabled={saving}
          onChange={(event) => setValue(event.target.value)} placeholder="e.g. 200" /></label>
        <label>Notes<Input value={notes} disabled={saving}
          onChange={(event) => setNotes(event.target.value)} placeholder="Corrective action, if any" /></label>
      </div>
      <Button disabled={saving || !value.trim()} onClick={save}><Save size={16} aria-hidden="true" />{saving ? "Saving…" : "Save sanitizer PPM"}</Button>
    </div>}
  </div></Card>;
}
