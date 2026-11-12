"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, Layers, Mail, ShieldCheck } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";
import { Alert, Field, PasswordField } from "@/components/auth/AuthShell";
import { BTB_ROLE_LABELS, isBtbRole } from "@/lib/btb-roles";
import { safeNextPath } from "@/lib/auth-redirect";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import "@/app/auth.css";

interface PublicInfo { authenticated?: boolean; accounts?: { role: string; email: string; name: string }[]; passwordHint?: string | null }

export default function BtbLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<PublicInfo>({});
  const [infoError, setInfoError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const emailError = submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter your team account email." : undefined;
  const passwordError = submitted && !password ? "Enter your workspace password." : undefined;

  useEffect(() => {
    let cancelled = false;
    void fetchJson<PublicInfo>("/api/btb/me").then((data) => {
      if (!cancelled) { setInfo(data); setInfoError(false); }
    }).catch(() => { if (!cancelled) setInfoError(true); });
    return () => { cancelled = true; };
  }, [revision]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (loading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) return;
    setLoading(true);
    setError("");
    try {
      await fetchJson("/api/btb/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(safeNextPath(next, "/between-the-buns", "/between-the-buns"));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.status === 401 ? "Your email and password don’t match. Check your details and try again." : cause.message : "Couldn’t reach the workspace. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  return <div className="ax btb-auth">
    <main className="ax__main"><div className="ax__top"><div className="btb-auth__brand"><BtbWordmark className="text-xl" /><span>Team workspace · powered by Pholo</span></div></div><div className="ax__body"><div className="ax__card">
      <p className="ax__eyebrow">Between the Buns</p><h1 className="ax__title">A good day starts here.</h1><p className="ax__sub">Use your individual employee email and password. Your shift checks and training are saved under your name.</p>
      <form className="ax__form" onSubmit={handleSubmit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Team email" error={emailError} icon={<Mail size={16} aria-hidden="true" />}>{(props) => <input {...props} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@restaurant.com" />}</Field>
        <PasswordField label="Workspace password" value={password} onChange={setPassword} error={passwordError} autoComplete="current-password" />
        <button className="btn btn--primary" type="submit" disabled={loading}>{loading ? <><span className="btn__spinner" aria-hidden="true" />Signing in…</> : <>Open my workspace<ArrowRight size={17} aria-hidden="true" /></>}</button>
      </form>
      {info.authenticated && <p className="foot"><a href="/between-the-buns">Continue with your current session</a></p>}
      {!!info.accounts?.length && <details className="btb-auth__accounts"><summary>Shared workspace accounts</summary><p>Individual employee sign-in is required to record daily checks and training.</p><div>{info.accounts.map((account) => <button key={account.role} type="button" aria-pressed={email === account.email} onClick={() => setEmail(account.email)}><strong>{isBtbRole(account.role) ? BTB_ROLE_LABELS[account.role] : account.role}</strong><span>{account.name}</span></button>)}</div>{info.passwordHint && <p className="btb-auth__hint">Development workspace password: <code>{info.passwordHint}</code></p>}</details>}
      {infoError && <p className="foot" role="status">Account shortcuts couldn’t load. You can enter your email above. <button className="link" onClick={() => setRevision((value) => value + 1)}>Try again</button></p>}
      <p className="foot">Need your account details? Ask your restaurant manager.</p>
    </div></div></main>
    <aside className="ax__aside"><div className="ax__aside-inner btb-auth__story"><p className="dash-focus__label">One team. A little more clarity.</p><h2>Everything for the shift.<br /><em>Room to focus.</em></h2><p>A workspace that follows your responsibilities, from the first opening check to the month-end close.</p><ul><li><ClipboardCheck size={21} aria-hidden="true" /><span><strong>Start with the essentials</strong>Prep, checklists and cleaning, ready for the day.</span></li><li><Layers size={21} aria-hidden="true" /><span><strong>Keep the bigger picture close</strong>Stock, people, records and renewals in one place.</span></li><li><ShieldCheck size={21} aria-hidden="true" /><span><strong>A view that fits your role</strong>Clear tools and access for every member of the team.</span></li></ul></div></aside>
  </div>;
}
