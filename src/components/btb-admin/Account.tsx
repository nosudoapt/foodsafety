"use client";

import { useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import type { BtbAdminIdentity } from "@/lib/btb-admin";

const EMPTY = { currentPassword: "", newPassword: "", confirm: "" };

export default function BtbAdminAccount({ admin }: { admin: BtbAdminIdentity }) {
  const id = useId();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(""); setNotice("");
    if (!form.currentPassword) { setError("Enter your current console password."); return; }
    if (form.newPassword.length < 10 || form.newPassword.length > 128) { setError("Use a new password of 10 to 128 characters."); return; }
    if (form.newPassword !== form.confirm) { setError("The new passwords don’t match."); return; }
    setBusy(true);
    try {
      await fetchJson("/api/btb/admin/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      setForm(EMPTY);
      setNotice("Password updated. Signing you out so you can use it…");
      // The version bump retires every issued cookie, including this one.
      window.location.replace("/auth/sign-in");
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.message : "Could not change the password. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  return <section className="ui-card btb-console__panel btb-console__account" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}><KeyRound size={18} aria-hidden="true" />Console account</h2>
    <p className="btb-console__hint">Signed in as <strong>{admin.email}</strong>. Changing the password signs out every other console session; this tab stays signed in.</p>
    <form onSubmit={changePassword} aria-busy={busy}>
      {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
      {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      <fieldset className="ui-form-stack" disabled={busy}>
        <label>Current console password<Input accent="red" aria-label="Current console password" type="password" required autoComplete="current-password" value={form.currentPassword} onChange={event => setForm({ ...form, currentPassword: event.target.value })} /></label>
        <label>New password<Input accent="red" aria-label="New password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={form.newPassword} onChange={event => setForm({ ...form, newPassword: event.target.value })} /><small>10 to 128 characters. Use something you don’t reuse elsewhere.</small></label>
        <label>Confirm new password<Input accent="red" aria-label="Confirm new password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={form.confirm} onChange={event => setForm({ ...form, confirm: event.target.value })} /></label>
      </fieldset>
      <div className="btb-console__form-actions"><Button accent="red" type="submit" disabled={busy}>{busy ? "Updating…" : "Change password"}</Button></div>
    </form>
  </section>;
}
