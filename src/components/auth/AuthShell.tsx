"use client";

// Shared chrome for every auth screen: the split composition (form column +
// ink "receipt" panel), the brand mark, and the field primitives.
// Tokens come from app/tokens.css; layout from app/auth.css.
import Link from "next/link";
import { useId, useState } from "react";
import { Eye, EyeOff, CircleAlert, Check, ClipboardCheck, Lock } from "lucide-react";
import { DayDotDial } from "@/components/marketing/dot-theme";
import { strengthOf } from "@/lib/password";

export { strengthOf };

/* ------------------------------------------------------------------ */
/* brand                                                               */
/* ------------------------------------------------------------------ */

export function AuthBrand({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <Link href="/" className="ax__brand" aria-label="Pholo home">
      <DayDotDial size={34} interactive={false} />
      {wordmark && <span className="ax__brand-word">Pholo</span>}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* shell                                                               */
/* ------------------------------------------------------------------ */

export function AuthShell({
  children,
  title = "The everyday, under control.",
  description = "One clear workspace for the people, records and routines that keep a restaurant moving.",
  points = ["A useful overview for every role", "Daily checks, temperatures and cleaning", "Business records and upcoming renewals"],
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  points?: string[];
}) {
  return (
    <div className="ax">
      <main className="ax__main">
        <div className="ax__top">
          <AuthBrand />
          <Link href="/" className="ax__top-link">
            Back to site
          </Link>
        </div>
        <div className="ax__body">
          <div className="ax__card">{children}</div>
        </div>
      </main>

      <aside className="ax__aside">
        <div className="ax__aside-inner auth-story">
          <p className="dash-focus__label">Pholo · The operations workspace</p>
          <h2>{title}</h2>
          <p>{description}</p>
          <ul className="ax__proofs">
            {points.map((point) => (
              <li key={point}>
                <ClipboardCheck size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* field                                                               */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  icon,
  id: idProp,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  id?: string;
  trailing?: React.ReactNode;
  children: (props: {
    id: string;
    className: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const msgId = `${id}-msg`;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        <span>{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </label>
      <div className="field__wrap">
        {icon && (
          <span className="field__icon" aria-hidden>
            {icon}
          </span>
        )}
        {children({
          id,
          className: `input${icon ? " input--icon" : ""}${trailing ? " input--trail" : ""}`,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? msgId : undefined,
        })}
        {trailing}
      </div>
      {error && (
        <p className="field__msg" id={msgId} role="alert">
          <CircleAlert size={13} strokeWidth={2.2} />
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* password input with reveal                                          */
/* ------------------------------------------------------------------ */

export function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete = "current-password",
  id: idProp,
  showStrength = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  autoComplete?: string;
  id?: string;
  showStrength?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const rules = strengthOf(value);

  return (
    <>
      <Field
        label={label}
        hint={hint}
        error={error}
        id={idProp}
        icon={<Lock size={15} strokeWidth={1.9} />}
        trailing={
          <button
            type="button"
            className="field__trail"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            tabIndex={0}
          >
            {visible ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
          </button>
        }
      >
        {(props) => (
          <input
            {...props}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            placeholder="••••••••"
          />
        )}
      </Field>

      {showStrength && value.length > 0 && (
        <div className="strength" aria-live="polite">
          <div className="strength__bars" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className="strength__bar"
                data-on={rules.level >= n}
                data-level={rules.level}
              />
            ))}
          </div>
          <div className="strength__row">
            <span>
              Strength <span className="strength__label">{rules.label}</span>
            </span>
            <span>{rules.level}/4</span>
          </div>
          <ul className="reqs">
            {rules.checks.map((c) => (
              <li key={c.key} className="req" data-met={c.met}>
                <span className="req__dot" aria-hidden>
                  {c.met && <Check size={9} strokeWidth={3.4} />}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* alerts                                                              */
/* ------------------------------------------------------------------ */

export function Alert({ kind, children }: { kind: "error" | "ok" | "info"; children: React.ReactNode }) {
  return (
    <div className={`alert alert--${kind}`} role={kind === "error" ? "alert" : "status"}>
      {kind === "ok" ? (
        <Check size={14} strokeWidth={2.6} />
      ) : (
        <CircleAlert size={14} strokeWidth={2.2} />
      )}
      <span>{children}</span>
    </div>
  );
}
