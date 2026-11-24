"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import {
  AuthShell,
  Alert,
  Field,
  PasswordField,
} from "@/components/auth/AuthShell";
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
  // A missing or wrong Supabase URL / anon key is a configuration fault, not a
  // wrong password — say so plainly instead of leaking the SDK message.
  if (m.includes("supabaseurl is required") || m.includes("invalid api key") || m.includes("failed to fetch")) {
    return "Sign-in is not configured for this site. Check the Supabase URL and key.";
  }
  if (m.includes("network")) {
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
  // A synchronous single-flight flag. `loading` is state and only updates on the
  // next render, so two submits in the same tick (a click plus an Enter, or a
  // double click) would both get through and one late 401 could paint "wrong
  // password" over a sign-in that had already succeeded.
  const inFlight = useRef(false);
  // Once the session is issued the form is done; nothing may repaint an error.
  const signedIn = useRef(false);
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
    if (!canSubmit || inFlight.current || signedIn.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");

    try {
      // One form for everyone. The server resolves which credential store owns
      // this email, verifies it, and returns the view that person may open.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => null)) as { permittedView?: string; error?: string } | null;
      if (!res.ok) {
        // A missing body is the platform failing (cold start, gateway timeout),
        // not a wrong password — never tell someone their password is wrong
        // when we never got an answer.
        const detail = data?.error;
        setError(res.status === 429
          ? "Too many attempts. Wait a few minutes, then try again."
          : detail ? friendlyAuthError(detail) : "We couldn’t sign you in just now. Try again in a moment.");
        return;
      }
      signedIn.current = true;
      setPassword("");
      // Keep the spinner up: the cookie is set, the next document is authorized.
      router.replace(safeNextPath(data?.permittedView ?? null));
    } catch {
      if (!signedIn.current) setError("Couldn’t reach the server. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      if (!signedIn.current) setLoading(false);
    }
  };

  return (
    <AuthShell>
      <p className="ax__eyebrow">Welcome back</p>
      <h1 className="ax__title">Sign in to your workspace</h1>
      <p className="ax__sub">
        One sign-in for every site, team and register you are assigned.
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

      <p className="foot">
        New to Pholo?{" "}
        <Link href="/auth/sign-up?trial=1">Start a 30-day trial</Link>
      </p>
    </AuthShell>
  );
}

function ConfirmationNotice() {
  const params = useSearchParams();
  return params.get("error") === "confirmation" ? <Alert kind="error">The confirmation link couldn’t be verified. Use the latest email, or try signing in to your confirmed account.</Alert> : null;
}
