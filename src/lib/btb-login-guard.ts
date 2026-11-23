/** Shared sign-in throttling rules. Kept free of server-only imports so the
 *  same numbers back the API, the console and the tests. */

/** Failed password attempts allowed per email in one window. */
export const EMAIL_FAILURE_LIMIT = 10;
/** Failed attempts allowed per IP in one window, across every email. */
export const IP_FAILURE_LIMIT = 30;
/** Length of the rolling window, in seconds (15 minutes). */
export const WINDOW_SECONDS = 900;

export interface SignInAttemptRow {
  blocked?: boolean | null;
  attempts?: number | null;
  retry_after?: number | null;
}

/** postgres returns a table value as an array of rows or a single row. */
export function firstAttemptRow(data: unknown): SignInAttemptRow {
  if (Array.isArray(data)) return (data[0] ?? {}) as SignInAttemptRow;
  return (data ?? {}) as SignInAttemptRow;
}

/** "Try again in 6 minutes." — never "wait 15 minutes" regardless of elapsed. */
export function lockoutMessage(seconds: number | null | undefined): string {
  const remaining = Math.max(0, Math.round(Number(seconds ?? 0)));
  const minutes = Math.max(1, Math.ceil(remaining / 60));
  return `Too many failed sign-ins. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}, or ask your manager to reset your password.`;
}

/** Masked email for the console list, e.g. `ni*****@gmail.com`. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  if (name.length <= 2) return `${name[0] ?? ""}***@${domain}`;
  return `${name.slice(0, 2)}${"*".repeat(Math.min(6, Math.max(3, name.length - 2)))}@${domain}`;
}
