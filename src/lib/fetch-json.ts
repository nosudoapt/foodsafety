export class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "RequestError";
  }
}

/** Shared browser requests: bounded waiting and useful HTTP/network failures. */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
  } catch (cause) {
    // A timeout must read as a slow server, not "signal timed out". Callers keep
    // the user's entries mounted, so the message only has to ask for a retry.
    if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
      throw new RequestError("The server took too long to answer. Please try again.", 408);
    }
    throw new RequestError("The site could not be reached. Check your connection and try again.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RequestError(typeof data?.error === "string" ? data.error : "The request could not be completed. Please try again.", response.status);
  }
  if (data === null) throw new RequestError("The server returned an incomplete response. Please try again.", response.status);
  return data as T;
}
