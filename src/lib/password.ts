// The password rule, in one place. Sign-up gates on `valid`; the strength
// meter and the requirement checklist both read from `strengthOf`, so the UI
// can never claim a password is acceptable when the submit path disagrees.
//
// Relative-import-free (no imports at all) so tests/*.test.ts can compile it.

export interface StrengthCheck {
  key: "len" | "case" | "num" | "sym";
  label: string;
  met: boolean;
}

export interface Strength {
  checks: StrengthCheck[];
  /** 0–4, the number of checks met. */
  level: 0 | 1 | 2 | 3 | 4;
  label: "" | "Weak" | "Fair" | "Good" | "Strong";
  /**
   * The bar for accepting a new password: at least 8 characters AND a mixed
   * case. Length alone is weak; mixed case alone is short.
   */
  valid: boolean;
}

export const MIN_LENGTH = 8;

export function strengthOf(value: string): Strength {
  const checks: StrengthCheck[] = [
    { key: "len", label: `${MIN_LENGTH}+ characters`, met: value.length >= MIN_LENGTH },
    {
      key: "case",
      label: "Upper & lower",
      met: /[a-z]/.test(value) && /[A-Z]/.test(value),
    },
    { key: "num", label: "A number", met: /\d/.test(value) },
    { key: "sym", label: "A symbol", met: /[^A-Za-z0-9]/.test(value) },
  ];

  const level = checks.filter((c) => c.met).length as Strength["level"];

  const label: Strength["label"] =
    value.length === 0
      ? ""
      : level <= 1
        ? "Weak"
        : level === 2
          ? "Fair"
          : level === 3
            ? "Good"
            : "Strong";

  const valid = checks[0].met && checks[1].met;

  return { checks, level, label, valid };
}

/** Cheap, permissive email shape check — the server is the real authority. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}