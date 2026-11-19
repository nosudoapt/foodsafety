"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";
import { Alert, Field, PasswordField } from "@/components/auth/AuthShell";
import { safeNextPath } from "@/lib/auth-redirect";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import "@/app/auth.css";

export default function BtbAdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailError = submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter your console email." : undefined;
  const passwordError = submitted && !password ? "Enter your console password." : undefined;

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setSubmitted(true);
    if (busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) return;
    setBusy(true); setError("");
    try {
      await fetchJson("/api/btb/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next"), "/btb/admin", "/btb/admin"));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.status === 401 ? "Your console email and password don’t match. Check your details and try again." : cause.message : "Couldn’t reach the console. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  return <div className="ax btb-auth btb-console-auth">
    <main className="ax__main"><div className="ax__top"><div className="btb-auth__brand"><BtbWordmark className="text-xl" /><span>Group console · powered by Pholo</span></div></div><div className="ax__body"><div className="ax__card">
      <p className="ax__eyebrow">Super-admin access</p><h1 className="ax__title">The group, in view.</h1><p className="ax__sub">Manage locations, invite people and keep an eye on the everyday. Use your separate console account.</p>
      <form className="ax__form" onSubmit={signIn} noValidate aria-busy={busy}>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Console email" error={emailError} icon={<Mail size={16} aria-hidden="true" />}>{props => <input {...props} type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} />}</Field>
        <PasswordField label="Console password" value={password} onChange={setPassword} error={passwordError} />
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Signing in…" : <>Open the console <ArrowRight size={17} aria-hidden="true" /></>}</button>
      </form>
      <p className="foot">This is not a shared demo or employee account. <Link href="/btb/login">Team sign-in</Link></p>
    </div></div></main>
    <aside className="ax__aside"><div className="ax__aside-inner btb-auth__story"><p className="dash-focus__label">Between the Buns · Group console</p><h2>A clear picture.<br /><em>At every location.</em></h2><p>Separate administration, familiar workflows. The team keeps its workspace; you keep control of who can use it.</p><ul><li><ShieldCheck size={23} aria-hidden="true" /><span><strong>Independent by design</strong>Console credentials never unlock the shared demo, and demo accounts never unlock this console.</span></li></ul></div></aside>
  </div>;
}
