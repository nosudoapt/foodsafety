export class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "RequestError";
  }
}

/** Shared browser requests: bounded waiting and useful HTTP/network failures. */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RequestError(typeof data?.error === "string" ? data.error : "The request could not be completed. Please try again.", response.status);
  }
  if (data === null) throw new RequestError("The server returned an incomplete response. Please try again.", response.status);
  return data as T;
}
