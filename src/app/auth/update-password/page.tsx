"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AuthShell, Alert, PasswordField, strengthOf } from "@/components/auth/AuthShell";
import { supabase } from "@/lib/supabase";
import "@/app/auth.css";

export default function UpdatePassword() {
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const strength = strengthOf(password);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      setValid(!error && !!data.session && !new URLSearchParams(window.location.search).has("error"));
      setReady(true);
    }).catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid || !strength.valid || password !== confirmation || saving) return;
    setSaving(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setError(error.message); return; }
      setSaved(true);
    } catch { setError("Your password couldn’t be updated. Check your connection and try again."); }
    finally { setSaving(false); }
  };

  return <AuthShell title="A fresh start for your account.">
    <p className="ax__eyebrow">Password help</p><h1 className="ax__title">{saved ? "Your password is updated" : "Choose a new password"}</h1>
    {!ready ? <div className="ax__form" role="status"><span className="ui-loader" aria-hidden="true" /> Checking your reset link…</div> : saved ? <div className="ax__form"><Alert kind="ok">Use your new password the next time you sign in.</Alert><Link className="btn btn--primary" href="/dashboard">Open my workspace <ArrowRight size={16} /></Link></div> : !valid ? <div className="ax__form"><Alert kind="error">This reset link is expired or incomplete. Request a new link and open the latest email.</Alert><Link className="btn btn--primary" href="/auth/reset-password">Request another reset link</Link></div> : <><p className="ax__sub">Choose a password for your next sign-in.</p><form className="ax__form" onSubmit={save} noValidate>{error && <Alert kind="error">{error}</Alert>}<PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" showStrength error={submitted && !strength.valid ? "Use at least 8 characters with upper and lower case." : undefined} /><PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" error={submitted && confirmation !== password ? "Enter the same password in both fields." : undefined} /><button className="btn btn--primary" disabled={saving}>{saving ? "Updating password…" : "Update password"}<ArrowRight size={16} /></button></form></>}
  </AuthShell>;
}
