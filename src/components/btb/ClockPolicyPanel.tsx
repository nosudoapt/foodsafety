"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { messageOf } from "@/components/btb/Feedback";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import type { ClockPolicy } from "@/lib/btb-clock-policy";
import type { TeamMember } from "@/lib/btb-team";

/** Manager-only on-site clock policy. Browser geolocation and the network
 *  allowlist deter remote clock-ins; only an on-site NFC/QR tag or biometric
 *  terminal can prove presence against a determined attacker. */
export default function ClockPolicyPanel({ locationId, employees }: { locationId: string; employees: TeamMember[] }) {
  const [policy, setPolicy] = useState<ClockPolicy | null>(null);
  const [form, setForm] = useState({ geofence: false, latitude: "", longitude: "", radiusM: "150", requireNetwork: false, networks: "", requireDevice: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetEmployee, setResetEmployee] = useState("");

  const apply = (value: ClockPolicy) => {
    setPolicy(value);
    setForm({
      geofence: value.geofence,
      latitude: value.latitude == null ? "" : String(value.latitude),
      longitude: value.longitude == null ? "" : String(value.longitude),
      radiusM: String(value.radiusM),
      requireNetwork: value.requireNetwork,
      networks: value.networks.join("\n"),
      requireDevice: value.requireDevice,
    });
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void fetchJson<{ policy: ClockPolicy }>(`/api/btb/clock-policy?location=${locationId}`, { signal: controller.signal })
      .then((result) => { if (!cancelled) { apply(result.policy); setError(""); } })
      .catch((cause) => { if (!cancelled) setError(messageOf(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [locationId]);

  const save = async (event: React.FormEvent, resetEmployeeId?: string) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await fetchJson<{ policy: ClockPolicy }>("/api/btb/clock-policy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, ...form, reset_employee_id: resetEmployeeId ?? null }),
      });
      apply(result.policy);
      setNotice(resetEmployeeId ? "Approved clock-in device reset. The employee can bind again on their next clock-in." : "Clock-in policy saved.");
      if (resetEmployeeId) setResetEmployee("");
    } catch (cause) { setError(cause instanceof RequestError ? cause.message : "The clock-in policy could not be saved."); }
    finally { setSaving(false); }
  };

  return <Card><div className="ops-panel">
    <div className="ops-toolbar"><div><h3>Clock-in location policy</h3><p className="ops-meta">Server checks, not browser claims. Geofence uses the phone&apos;s reported position; the network allowlist uses the request IP; device binding limits the first clock-in device. A rooted phone can still fake GPS — for the strongest proof use an on-site NFC/QR tag or biometric terminal.</p></div><Badge accent={policy?.geofence || policy?.requireNetwork || policy?.requireDevice ? "green" : "amber"}>{policy?.geofence || policy?.requireNetwork || policy?.requireDevice ? "On-site checks on" : "Open clock-in"}</Badge></div>
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    {loading ? <p className="ops-meta" role="status">Loading clock-in policy…</p> : <form onSubmit={(event) => void save(event)} className="ops-form-stack" aria-busy={saving}>
      <label className="ops-checkbox"><input type="checkbox" checked={form.geofence} onChange={(event) => setForm({ ...form, geofence: event.target.checked })} /><span>Require the restaurant geofence</span></label>
      <div className="ops-form-grid"><label>Latitude<Input inputMode="decimal" placeholder="51.4650" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label><label>Longitude<Input inputMode="decimal" placeholder="-112.7190" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label><label>Radius (metres)<Input type="number" min={25} max={5000} value={form.radiusM} onChange={(event) => setForm({ ...form, radiusM: event.target.value })} /></label></div>
      <label className="ops-checkbox"><input type="checkbox" checked={form.requireNetwork} onChange={(event) => setForm({ ...form, requireNetwork: event.target.checked })} /><span>Require the restaurant network / public IP</span></label>
      <label>Allowed IPs or CIDR ranges <span>one per line</span><textarea className="ui-input" rows={2} value={form.networks} onChange={(event) => setForm({ ...form, networks: event.target.value })} placeholder={"203.0.113.10\n203.0.113.0/24"} /></label>
      <label className="ops-checkbox"><input type="checkbox" checked={form.requireDevice} onChange={(event) => setForm({ ...form, requireDevice: event.target.checked })} /><span>Bind each employee to one clock-in device</span></label>
      <div className="ui-actions"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save clock-in policy"}</Button></div>
      <label>Reset an approved device <span>optional</span><select className="ui-input" value={resetEmployee} onChange={(event) => setResetEmployee(event.target.value)}><option value="">Choose an employee</option>{employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
      {resetEmployee && <div className="ui-actions"><Button type="button" variant="danger" disabled={saving} onClick={(event) => void save(event, resetEmployee)}>Reset device for this employee</Button></div>}
    </form>}
  </div></Card>;
}
