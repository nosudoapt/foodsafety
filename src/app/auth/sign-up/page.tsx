"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Mail, Store, User } from "lucide-react";
import {
  AuthShell,
  Alert,
  Field,
  PasswordField,
  strengthOf,
} from "@/components/auth/AuthShell";
import "@/app/auth.css";
import { safeNextPath } from "@/lib/auth-redirect";

type Step = 1 | 2;

// What the trial actually includes, shown on step one so the price is never
// a surprise after the form.
const TRIAL_POINTS = [
  "Every log type — temperatures, prep, cleaning",
  "The compliance register with early warnings",
  "The secure operations vault",
  "Tools for staff, managers and owners",
];

export default function SignUp() {
  const [step, setStep] = useState<Step>(1);
  const [fullName, setFullName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const router = useRouter();

  const strength = useMemo(() => strengthOf(password), [password]);

  const nameError =
    touched.fullName && fullName.trim().length < 2 ? "Tell us who you are." : undefined;
  const restaurantError =
    touched.restaurantName && restaurantName.trim().length < 2
      ? "Enter your restaurant's name."
      : undefined;
  const emailError =
    touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "That doesn't look like an email address."
      : undefined;
  const passwordError =
    touched.password && !strength.valid
      ? "Use at least 8 characters, with upper and lower case."
      : undefined;

  const stepOneOk =
    fullName.trim().length >= 2 && restaurantName.trim().length >= 2;
  const stepTwoOk =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && strength.valid;

  const goStepTwo = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, fullName: true, restaurantName: true }));
    if (stepOneOk) setStep(2);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, email: true, password: true }));
    if (!stepTwoOk || loading) return;
    setLoading(true);
    setError("");

    // Profile row is created server-side by the handle_new_user trigger
    // (supabase/schema-roles.sql) from this metadata — no client insert,
    // so it can't fail RLS before email confirmation.
    // trial=1 in the URL starts a 30-day trial window (set by the trigger).
    const isTrial =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("trial") === "1";

    try {
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        data: {
          full_name: fullName.trim(),
          restaurant_name: restaurantName.trim(),
          role: "owner",
          trial: isTrial ? "1" : "0",
        },
      },
    });

    if (authError) {
      const m = authError.message.toLowerCase();
      setError(
        m.includes("already registered") || m.includes("already been registered")
          ? "That email already has an account. Sign in instead, or reset the password."
          : m.includes("password")
            ? "That password was rejected. Try a longer one."
            : authError.message
      );
      return;
    }

    if (!data.session) { setConfirmationSent(true); return; }
    router.replace(next);
    router.refresh();
    } catch {
      setError("Couldn’t reach the server. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  if (confirmationSent) return <AuthShell><p className="ax__eyebrow">One more step</p><h1 className="ax__title">Check your email</h1><p className="ax__sub">Follow the confirmation link sent to <strong>{email}</strong> to finish setting up your workspace.</p><div className="ax__form"><Alert kind="ok">Check your spam folder if the message hasn’t arrived.</Alert><Link className="btn btn--primary" href="/auth/sign-in">Back to sign in <ArrowRight size={16} /></Link></div></AuthShell>;

  return (
    <AuthShell title="A clear start for your restaurant." description="Bring the day’s routines and business records together, with a focused workspace for every role.">
      <p className="ax__eyebrow">
        {step === 1 ? "Step 1 of 2" : "Step 2 of 2"} · Workspace setup
      </p>
      <h1 className="ax__title">
        {step === 1 ? "Set up your site" : "Create your login"}
      </h1>
      <p className="ax__sub">
        {step === 1
          ? "Two short steps to set up your restaurant workspace."
          : `Signing up as ${fullName || "you"} at ${restaurantName || "your restaurant"}.`}
      </p>

      {step === 1 ? (
        <form className="ax__form" onSubmit={goStepTwo} noValidate>
          <Field
            label="Your name"
            error={nameError}
            icon={<User size={15} strokeWidth={1.9} />}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                autoComplete="name"
                placeholder="Avery Chen"
                required
              />
            )}
          </Field>

          <Field
            label="Restaurant name"
            error={restaurantError}
            icon={<Store size={15} strokeWidth={1.9} />}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, restaurantName: true }))}
                autoComplete="organization"
                placeholder="The Golden Fork"
                required
              />
            )}
          </Field>

          <div className="alert alert--info">
            <Check size={14} strokeWidth={2.6} />
            <span>
              <strong style={{ fontWeight: 600 }}>Your workspace brings together</strong>
              <span style={{ display: "block", marginTop: 4, lineHeight: 1.55 }}>
                {TRIAL_POINTS.join(" · ")}
              </span>
            </span>
          </div>

          <button type="submit" className="btn btn--primary">
            Continue <ArrowRight size={16} strokeWidth={2.2} />
          </button>

          <p className="foot" style={{ marginTop: 0 }}>
            Already have an account? <Link href="/auth/sign-in">Sign in</Link>
          </p>
        </form>
      ) : (
        <form className="ax__form" onSubmit={handleSignUp} noValidate>
          {error && <Alert kind="error">{error}</Alert>}

          <Field label="Work email" error={emailError} icon={<Mail size={15} strokeWidth={1.9} />}>
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
            autoComplete="new-password"
            showStrength
          />

          <p className="terms">
            You’ll create an owner account for this restaurant.
          </p>

          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? (
              <>
                <span className="btn__spinner" aria-hidden />
                Creating your account…
              </>
            ) : (
              <>
                Create account <ArrowRight size={16} strokeWidth={2.2} />
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => setStep(1)}
            disabled={loading}
          >
            <ArrowLeft size={15} strokeWidth={2.2} /> Back
          </button>
        </form>
      )}

      <p className="foot">
        Already have an account? <Link href="/auth/sign-in">Sign in</Link>
      </p>
    </AuthShell>
  );
}
