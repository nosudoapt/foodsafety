"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { IndividualLoginNotice, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";

export default function AccountPage() {
  const { identity } = useBtbWorkspace();
  const [form, setForm] = useState({ currentPassword: "", password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError(""); setNotice("");
    if (form.password !== form.confirm) { setError("The new passwords do not match."); return; }
    setSaving(true);
    try { await fetchJson("/api/btb/account", jsonRequest(form)); setForm({ currentPassword: "", password: "", confirm: "" }); setNotice("Your password is changed. Other sessions have been signed out."); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <div className="btb-page ops-workspace"><PageHeader title="My account" subtitle={`${identity?.name ?? "Your account"} · ${identity?.email ?? ""}`} />
    {!identity?.employeeId ? <IndividualLoginNotice next="/between-the-buns/account" /> : <Card className="ops-form-card"><div className="ops-card-heading"><KeyRound size={22} /><div><h2>Change your password</h2><p>Choose a password of 10–128 characters.</p></div></div><form onSubmit={save}>
      {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}{notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      <fieldset className="ui-form-stack" disabled={saving}><label>Current password<Input type="password" autoComplete="current-password" required maxLength={128} value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label><label>New password<Input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label>Confirm new password<Input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} /></label><Button type="submit">{saving ? "Changing password…" : "Change password"}</Button></fieldset>
    </form></Card>}
  </div>;
}
