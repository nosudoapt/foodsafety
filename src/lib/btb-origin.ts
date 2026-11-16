/** Browser mutations must come from this request's authority, not a forwarded
 * host supplied by the client. Non-browser requests may omit Origin. */
export function btbOriginAllowed(request: Pick<Request, "url" | "headers">): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const expected = new URL(request.url);
    // NextURL normalizes loopback hostnames; Host preserves the real authority.
    const host = request.headers.get("host");
    if (host) expected.host = host;
    return origin === expected.origin;
  } catch { return false; }
}
