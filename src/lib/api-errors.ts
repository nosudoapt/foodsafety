// Only controlled application errors may be displayed. DB/provider messages can
// contain credentials, PII or internal addresses and are never a UI contract.
export class BtbApiError extends Error {
  declare readonly cause?: unknown;
  constructor(message: string, public status = 400, cause?: unknown) {
    super(message);
    Object.defineProperty(this, "cause", { value: cause });
  }
}

export function publicFailure(error: unknown) {
  return error instanceof BtbApiError
    ? { error: error.message, status: error.status }
    : { error: "The workspace could not complete this request. Please try again.", status: 503 };
}

/** Useful diagnostic metadata without raw text, SQL DETAIL, arguments or rows. */
export function failureDetails(error: unknown, depth = 0): Record<string, unknown> {
  if (depth > 3) return { type: "NestedFailure" };
  if (!error || typeof error !== "object") return { type: typeof error };
  const value = error as { code?: unknown; cause?: unknown; stage?: unknown; recovered?: unknown };
  return {
    type: error instanceof Error ? "Error" : "DependencyError",
    ...(typeof value.code === "string" && /^[A-Z0-9_]{1,32}$/.test(value.code) ? { code: value.code } : {}),
    ...(typeof value.stage === "string" && /^[a-z]{1,20}$/.test(value.stage) ? { stage: value.stage } : {}),
    ...(typeof value.recovered === "boolean" ? { recovered: value.recovered } : {}),
    ...(value.cause && value.cause !== error ? { cause: failureDetails(value.cause, depth + 1) } : {}),
  };
}

export function publicPlatformFailure(message: string, code: string | undefined, fallback: string): BtbApiError {
  const cause = { code, message };
  if (code === "42501") return new BtbApiError("Your role or location access cannot make this change.", 403, cause);
  if (code === "40001") return new BtbApiError("This record changed on another device. Reload before saving.", 409, cause);
  if (["42P01", "42883", "PGRST205", "PGRST202"].includes(code ?? "")) {
    return new BtbApiError("The location workspace is not connected yet. Ask your administrator to apply the location release, then retry.", 503, cause);
  }
  // Validation SQLSTATEs still give a useful controlled operation-specific hint.
  return new BtbApiError(fallback, code?.startsWith("22") || code === "23514" ? 400 : 503, cause);
}
