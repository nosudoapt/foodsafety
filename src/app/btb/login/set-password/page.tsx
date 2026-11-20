"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";
import { Alert, PasswordField } from "@/components/auth/AuthShell";
import { jsonRequest } from "@/components/btb/Feedback";
import { fetchJson, RequestError } from "@/lib/fetch-json";
import type { BtbInvitationInfo } from "@/lib/btb-admin";
import { announceBtbSessionChange, clearBtbPublicCapabilities } from "@/lib/btb-public-fetch";
import "@/app/auth.css";

export default function BtbInvitationPasswordPage() {
  const [invitation, setInvitation] = useState<BtbInvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const passwordError = submitted && (password.length < 10 || password.length > 128) ? "Use between 10 and 128 characters." : undefined;
  const confirmationError = submitted && confirmation !== password ? "Your passwords don’t match." : undefined;
  useEffect(() => {
    const controller = new AbortController();
    const token = new URLSearchParams(window.location.search).get("token");
    void fetchJson<{ invitation: BtbInvitationInfo }>("/api/btb/invitations/lookup", { ...jsonRequest({ token }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(result => { if (!controller.signal.aborted) setInvitation(result.invitation); })
      .catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Couldn’t open this invitation. Check your connection."); setUnavailable(cause instanceof RequestError && cause.status === 410); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function accept(event: React.FormEvent) {
    event.preventDefault(); setSubmitted(true);
    if (busy || password.length < 10 || password.length > 128 || confirmation !== password) return;
    setBusy(true); setError("");
    clearBtbPublicCapabilities();
    try {
      await fetchJson("/api/btb/invitations/accept", jsonRequest({ token: new URLSearchParams(window.location.search).get("token"), password }));
      announceBtbSessionChange();
      setPassword(""); setConfirmation(""); window.location.replace("/btb/demo");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t finish setup. Check your connection, or try signing in with your new password."); setUnavailable(cause instanceof RequestError && cause.status === 410); }
    finally { setBusy(false); }
  }
  return <div className="ax btb-auth btb-console-auth"><main className="ax__main"><div className="ax__top"><div className="btb-auth__brand"><BtbWordmark className="text-xl" /><span>Your individual workspace · powered by Pholo</span></div></div><div className="ax__body"><div className="ax__card"><p className="ax__eyebrow">Your invitation</p><h1 className="ax__title">Make it your own.</h1>{loading ? <p role="status" className="ax__sub">Opening your secure invitation…</p> : <>{invitation && !unavailable && <p className="ax__sub">Welcome, {invitation.name}. Set your password for <strong>{invitation.email}</strong> at {invitation.location}. This password is yours across assigned locations.</p>}{error && <Alert kind="error">{error}</Alert>}{invitation && !unavailable && <form className="ax__form" onSubmit={accept} noValidate aria-busy={busy}><PasswordField label="New employee password" value={password} onChange={setPassword} error={passwordError} hint="10–128 characters" autoComplete="new-password" /><PasswordField label="Confirm employee password" value={confirmation} onChange={setConfirmation} error={confirmationError} autoComplete="new-password" /><p className="btb-console__hint">Setting this password replaces any previous employee password and signs out older employee sessions. Console and shared demo accounts are not changed.</p><button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Setting your password…" : <>Set password & open workspace<ArrowRight size={17} aria-hidden="true" /></>}</button></form>}{!invitation && !unavailable && <button className="btn btn--secondary" onClick={() => window.location.reload()}>Retry invitation</button>}</>}<p className="foot">Already set your password? <Link href="/btb/login">Team sign-in</Link></p></div></div></main><aside className="ax__aside"><div className="ax__aside-inner btb-auth__story"><p className="dash-focus__label">Between the Buns · Your workspace</p><h2>Your name.<br /><em>Your everyday.</em></h2><p>One personal account, a clear record of your work. Your administrator chooses the locations and pages you can use.</p><ul><li><KeyRound size={23} aria-hidden="true" /><span><strong>Private by design</strong>Your administrator sends the invitation; you choose your password. A setup link works only once and expires after seven days.</span></li></ul></div></aside></div>;
}
