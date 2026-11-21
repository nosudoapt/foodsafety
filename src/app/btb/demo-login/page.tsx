"use client";

import { useEffect, useState } from "react";
import { ArrowRight, EyeOff } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";
import { Alert, Field, PasswordField } from "@/components/auth/AuthShell";
import { BTB_ROLE_LABELS, isBtbRole } from "@/lib/btb-roles";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import { announceBtbSessionChange, clearBtbPublicCapabilities } from "@/lib/btb-public-fetch";
import "@/app/auth.css";

interface DemoInfo { slug?: string; accounts?: { role: string; email: string; name: string }[] }

// Reached only through the hidden /btb/<BTB_DEMO_SLUG>/login rewrite.
export default function BtbDemoLogin() {
  const [slug, setSlug] = useState("");
  const [info, setInfo] = useState<DemoInfo>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = window.location.pathname.split("/")[2] ?? "";
    if (!value) return;
    let cancelled = false;
    void fetchJson<DemoInfo>(`/api/btb/demo-login?slug=${encodeURIComponent(value)}`)
      .then((data) => { if (!cancelled) { setSlug(value); setInfo(data); } })
      .catch(() => { if (!cancelled) { setSlug(value); setError("This demo door is not available."); } });
    return () => { cancelled = true; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !slug || !email.trim() || !password) return;
    setLoading(true); setError("");
    clearBtbPublicCapabilities();
    try {
      await fetchJson("/api/btb/demo-login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email: email.trim(), password }),
      });
      announceBtbSessionChange();
      window.location.replace(`/btb/${slug}`);
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.message : "Couldn’t reach the demo. Try again.");
    } finally { setLoading(false); }
  };

  return <div className="ax btb-auth">
    <main className="ax__main"><div className="ax__top"><div className="btb-auth__brand"><BtbWordmark className="text-xl" /><span>Private demo · powered by Pholo</span></div></div><div className="ax__body"><div className="ax__card">
      <p className="ax__eyebrow"><EyeOff size={14} aria-hidden="true" /> Private demo workspace</p><h1 className="ax__title">Between the Buns demo.</h1><p className="ax__sub">Shared role accounts only. This door is not linked from the team sign-in and is not a location workspace.</p>
      <form className="ax__form" onSubmit={submit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Demo email">{(props) => <input {...props} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="manager@btb.demo" />}</Field>
        <PasswordField label="Shared demo password" value={password} onChange={setPassword} autoComplete="current-password" />
        <button className="btn btn--primary" type="submit" disabled={loading || !slug}>{loading ? "Signing in…" : <>Open the demo<ArrowRight size={17} aria-hidden="true" /></>}</button>
      </form>
      {!!info.accounts?.length && <details className="btb-auth__accounts" open><summary>Shared demo accounts</summary><p>These accounts are for the demo only. Real teammates use their individual email at the team sign-in.</p><div>{info.accounts.map((account) => <button key={account.role} type="button" aria-pressed={email === account.email} onClick={() => setEmail(account.email)}><strong>{isBtbRole(account.role) ? BTB_ROLE_LABELS[account.role] : account.role}</strong><span>{account.name}</span></button>)}</div></details>}
      <p className="foot">Looking for your own workspace? Use the <a href="/btb/login">team sign-in</a>.</p>
    </div></div></main>
  </div>;
}
