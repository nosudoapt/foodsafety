"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleCheck, Mail } from "lucide-react";
import { AuthShell, Alert, Field } from "@/components/auth/AuthShell";
import "@/app/auth.css";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailError =
    touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "Enter the email on your account."
      : undefined;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (loading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    setLoading(true);
    setError("");

    try {
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/auth/callback?flow=recovery` }
    );

    if (authError) {
      const m = authError.message.toLowerCase();
      setError(
        m.includes("rate limit") || m.includes("too many")
          ? "Too many reset requests. Wait a few minutes, then try again."
          : authError.message
      );
    } else {
      setSent(true);
    }
    } catch {
      setError("Couldn’t send the reset email. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell title="Back to your day, in a few steps." description="Request a link, choose a new password, and return to your restaurant workspace." points={["Use the email on your account", "Follow the latest reset link", "Choose a new password to continue"]}>
      {sent ? (
        <>
          <p className="ax__eyebrow">Check your inbox</p>
          <h1 className="ax__title">Reset link sent</h1>
          <p className="ax__sub">
            If an account exists for <strong style={{ color: "var(--ink)" }}>{email}</strong>,
            a reset link is on its way. Use the latest email to continue.
          </p>

          <div className="ax__form">
            <div className="alert alert--ok">
              <CircleCheck size={15} strokeWidth={2.2} />
              <span>
                Nothing arrived? Check the spam folder, then try again in a
                minute.
              </span>
            </div>

            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => {
                setSent(false);
                setTouched(false);
              }}
            >
              <ArrowLeft size={15} strokeWidth={2.2} /> Use a different email
            </button>
          </div>

          <p className="foot">
            <Link href="/auth/sign-in">Back to sign in</Link>
          </p>
        </>
      ) : (
        <>
          <p className="ax__eyebrow">Password help</p>
          <h1 className="ax__title">Reset your password</h1>
          <p className="ax__sub">
            Enter the email on your account and we&apos;ll send a link to set a
            new password.
          </p>

          <form className="ax__form" onSubmit={handleReset} noValidate>
            {error && <Alert kind="error">{error}</Alert>}

            <Field label="Email" error={emailError} icon={<Mail size={15} strokeWidth={1.9} />}>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="email"
                  placeholder="you@restaurant.com"
                  required
                />
              )}
            </Field>

            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? (
                <>
                  <span className="btn__spinner" aria-hidden />
                  Sending…
                </>
              ) : (
                <>
                  Send reset link <ArrowRight size={16} strokeWidth={2.2} />
                </>
              )}
            </button>
          </form>

          <p className="foot">
            <Link href="/auth/sign-in">Back to sign in</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
