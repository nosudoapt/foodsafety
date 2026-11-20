"use client";

import { useId, useState } from "react";
import { Button, Input } from "@/components/ui";
import { jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";
import { validateBtbAdminLocation, type BtbAdminLocation } from "@/lib/btb-admin";
import PageGrantPicker from "./PageGrantPicker";

export default function LocationForm({ location, onSaved, onCancel, onBusyChange }: {
  location?: BtbAdminLocation; onSaved: (id: string) => void; onCancel?: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const [form, setForm] = useState({ name: location?.name ?? "", address: location?.address ?? "", timezone: location?.timezone ?? "", active: location?.active ?? true, pages: location?.pages ?? [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saving) return;
    const body = { ...form, ...(location ? { version: location.version } : {}) };
    const invalid = validateBtbAdminLocation(body, !!location);
    if (invalid) { setError(invalid); return; }
    setSaving(true); onBusyChange?.(true); setError("");
    try {
      const result = await fetchJson<{ id: string }>(`/api/btb/admin/locations${location ? `/${location.id}` : ""}`, jsonRequest(body, location ? "PATCH" : "POST"));
      onSaved(result.id);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); onBusyChange?.(false); }
  }
  return <form onSubmit={save} aria-busy={saving}>
    {error && <p className="ui-notice ui-notice--error" role="alert">{error} Your draft is still here.</p>}
    <fieldset className="ui-form-stack" disabled={saving}>
      <label>Location name<Input accent="red" data-modal-autofocus autoComplete="organization" required maxLength={150} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>Address <span>optional</span><Input accent="red" autoComplete="street-address" maxLength={300} value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></label>
      <label>IANA timezone<Input accent="red" required list={`${id}-timezones`} placeholder="America/Regina" maxLength={100} value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })} /><small>Used by location reports and operational days. Choose the actual location’s timezone.</small></label>
      <datalist id={`${id}-timezones`}>{["America/Regina", "America/Winnipeg", "America/Edmonton", "America/Vancouver", "America/Toronto", "America/Halifax", "America/St_Johns"].map(zone => <option key={zone} value={zone} />)}</datalist>
      {location && <label className="btb-console__checkbox"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} /><span>Active location<small>Closing a location stops its workflows, invitation acceptance and scheduled emails. Records and memberships are kept.</small></span></label>}
      {!location && <p className="btb-console__hint">New locations start with no people and no page grants. No passwords or demo users are seeded.</p>}
      <PageGrantPicker pages={form.pages} onChange={pages => setForm({ ...form, pages })} />
    </fieldset>
    <div className="btb-console__form-actions">{onCancel && <Button accent="red" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>}<Button accent="red" type="submit" disabled={saving}>{saving ? "Saving…" : location ? "Save location" : "Create location"}</Button></div>
  </form>;
}
