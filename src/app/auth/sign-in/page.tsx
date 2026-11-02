"use client";

import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import {
  AuthShell,
  Alert,
  Field,
  PasswordField,
} from "@/components/auth/AuthShell";
import { DemoPanel } from "@/components/auth/DemoPanel";
import { safeNextPath } from "@/lib/auth-redirect";
import "@/app/auth.css";

// Turns Supabase's terse auth errors into something a person can act on.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Check both, or reset your password.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — we sent you a link when you signed up.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return message;
}

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const emailError =
    touched.email && !email.trim()
      ? "Enter the email you signed up with."
      : touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? "That doesn't look like an email address."
        : undefined;
  const passwordError =
    touched.password && !password ? "Enter your password." : undefined;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !emailError;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) { setError(friendlyAuthError(authError.message)); return; }
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(safeNextPath(next));
      router.refresh();
    } catch {
      setError("Couldn’t reach the server. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <p className="ax__eyebrow">Welcome back</p>
      <h1 className="ax__title">Sign in to your workspace</h1>
      <p className="ax__sub">
        Your logs, your vault and every site you run — one register.
      </p>

      <form className="ax__form" onSubmit={handleSignIn} noValidate>
        <Suspense><ConfirmationNotice /></Suspense>
        {error && <Alert kind="error">{error}</Alert>}

        <Field label="Email" error={emailError} icon={<Mail size={15} strokeWidth={1.9} />}>
          {(props) => (
            <input
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              autoComplete="email"
              placeholder="you@restaurant.com"
              required
            />
          )}
        </Field>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          error={passwordError}
          autoComplete="current-password"
        />

        <div className="row-between">
          <Link href="/auth/reset-password" className="link">
            Forgot password?
          </Link>
        </div>

        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? (
            <>
              <span className="btn__spinner" aria-hidden />
              Signing in…
            </>
          ) : (
            <>
              Sign in <ArrowRight size={16} strokeWidth={2.2} />
            </>
          )}
        </button>
      </form>

      <DemoPanel />

      <p className="foot">
        New to FoodSafe?{" "}
        <Link href="/auth/sign-up?trial=1">Start a 30-day trial</Link>
      </p>

      <div className="divider">or</div>
      <p className="foot" style={{ marginTop: 0 }}>
        Signing in for{" "}
        <Link href="/between-the-buns/login" style={{ color: "var(--muted-2)" }}>
          Between the Buns
        </Link>
        ?
      </p>
    </AuthShell>
  );
}

function ConfirmationNotice() {
  const params = useSearchParams();
  return params.get("error") === "confirmation" ? <Alert kind="error">The confirmation link couldn’t be verified. Use the latest email, or try signing in to your confirmed account.</Alert> : null;
}
