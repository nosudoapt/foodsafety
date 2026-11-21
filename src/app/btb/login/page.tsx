"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, Layers, Mail, ShieldCheck } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";
import { Alert, Field, PasswordField } from "@/components/auth/AuthShell";
import { safeNextPath } from "@/lib/auth-redirect";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import { announceBtbSessionChange, clearBtbPublicCapabilities } from "@/lib/btb-public-fetch";
import "@/app/auth.css";

interface PublicInfo { authenticated?: boolean }
interface Branch { name: string; slug: string }

export default function BtbLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<PublicInfo>({});
  const [branchError, setBranchError] = useState(false);
  const [infoError, setInfoError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const emailError = submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter your team account email." : undefined;
  const passwordError = submitted && !password ? "Enter your workspace password." : undefined;

  useEffect(() => {
    let cancelled = false;
    void fetchJson<PublicInfo>("/api/btb/me").then((data) => {
      if (!cancelled) { setInfo(data); setInfoError(false); }
    }).catch(() => { if (!cancelled) setInfoError(true); });
    void fetchJson<{ locations: Branch[] }>("/api/btb/locations").then((data) => {
      if (cancelled) return;
      setBranches(data.locations);
      setBranch(data.locations.length === 1 ? data.locations[0].slug : "");
      setBranchError(false);
    }).catch(() => { if (!cancelled) setBranchError(true); });
    return () => { cancelled = true; };
  }, [revision]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (loading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password || (branches.length > 0 && !branch)) return;
    setLoading(true);
    clearBtbPublicCapabilities();
    setError("");
    try {
      const result = await fetchJson<{ slug?: string }>("/api/btb/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, locationSlug: branch }) });
      announceBtbSessionChange();
      const next = new URLSearchParams(window.location.search).get("next");
      const fallback = result.slug ? `/btb/${result.slug}` : "/btb/demo";
      window.location.replace(safeNextPath(next, fallback, "/btb"));
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.status === 401 ? "Your email and password don’t match. Check your details and try again." : cause.message : "Couldn’t reach the workspace. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  return <div className="ax btb-auth">
    <main className="ax__main"><div className="ax__top"><div className="btb-auth__brand"><BtbWordmark className="text-xl" /><span>Team workspace · powered by Pholo</span></div></div><div className="ax__body"><div className="ax__card">
      <p className="ax__eyebrow">Between the Buns</p><h1 className="ax__title">A good day starts here.</h1><p className="ax__sub">Sign in with the individual employee email and password your restaurant manager set up for you. Your shift checks and training are saved under your name.</p>
      {branches.length > 0 && <div className="btb-auth__branch">
        <p className="ax__eyebrow">Which location are you signing in to?</p>
        <div className="btb-auth__branch-grid">{branches.map((item) => <button key={item.slug} type="button" aria-pressed={branch === item.slug} onClick={() => setBranch(item.slug)}><strong>{item.name}</strong><span>/btb/{item.slug}</span></button>)}</div>
      </div>}
      {branchError && <p className="foot" role="status">Branch list couldn’t load. You can still enter your email; we’ll use your assigned location.</p>}
      <form className="ax__form" onSubmit={handleSubmit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        {branches.length > 1 && !branch && <Alert kind="error">Choose your location to continue.</Alert>}
        <Field label="Team email" error={emailError} icon={<Mail size={16} aria-hidden="true" />}>{(props) => <input {...props} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@restaurant.com" />}</Field>
        <PasswordField label="Workspace password" value={password} onChange={setPassword} error={passwordError} autoComplete="current-password" />
        <button className="btn btn--primary" type="submit" disabled={loading}>{loading ? <><span className="btn__spinner" aria-hidden="true" />Signing in…</> : <>Open my workspace<ArrowRight size={17} aria-hidden="true" /></>}</button>
      </form>
      {info.authenticated && <p className="foot"><a href="/btb/demo">Continue with your current session</a></p>}
      {infoError && <p className="foot" role="status">We couldn’t check your current session. You can still enter your email above. <button className="link" onClick={() => setRevision((value) => value + 1)}>Try again</button></p>}
      <p className="foot">Need your account details? Ask your restaurant manager. Only individual employee accounts can sign in here.</p>
    </div></div></main>
    <aside className="ax__aside"><div className="ax__aside-inner btb-auth__story"><p className="dash-focus__label">One team. A little more clarity.</p><h2>Everything for the shift.<br /><em>Room to focus.</em></h2><p>A workspace that follows your responsibilities, from the first opening check to the month-end close.</p><ul><li><ClipboardCheck size={21} aria-hidden="true" /><span><strong>Start with the essentials</strong>Prep, checklists and cleaning, ready for the day.</span></li><li><Layers size={21} aria-hidden="true" /><span><strong>Keep the bigger picture close</strong>Stock, people, records and renewals in one place.</span></li><li><ShieldCheck size={21} aria-hidden="true" /><span><strong>A view that fits your role</strong>Clear tools and access for every member of the team.</span></li></ul></div></aside>
  </div>;
}
