import { btbBrowserScope } from "./btb-browser-scope";

type Capability = { token: string; expiresAt: string };
const capabilities = new Map<string, Capability>();
const fetching = new Map<string, { promise: Promise<Capability>; controller: AbortController }>();
const requests = new Set<AbortController>();
let workspace = "";
let identityKey = "";
let generation = 0;
let listening = false;
export const BTB_SESSION_EVENT = "btb-session-changed";
export const BTB_SESSION_STORAGE = "btb-session-change";

/** Discard cached AND in-flight bearer capabilities. A late response from the
 * previous identity may never repopulate the cache or authorize a new request. */
export function clearBtbPublicCapabilities(): void {
  generation += 1;
  capabilities.clear();
  for (const pending of fetching.values()) pending.controller.abort();
  fetching.clear();
  for (const request of requests) request.abort();
  requests.clear();
}

export function syncBtbCapabilityIdentity(identity: { employeeId: string | null; role: string; sessionVersion?: number | null } | null): void {
  const next = identity ? `${identity.employeeId ?? "shared"}:${identity.role}:${identity.sessionVersion ?? ""}` : "";
  if (identityKey !== next) { clearBtbPublicCapabilities(); identityKey = next; }
}

/** No token/identity is stored in localStorage; this is only a cross-tab reset
 * signal for our login, password setup and logout flows. */
export function announceBtbSessionChange(): void {
  clearBtbPublicCapabilities();
  identityKey = "";
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BTB_SESSION_EVENT));
  try { window.localStorage.setItem(BTB_SESSION_STORAGE, crypto.randomUUID()); } catch { /* Storage may be disabled. */ }
}

function listenForSessionChanges() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(BTB_SESSION_EVENT, clearBtbPublicCapabilities);
  window.addEventListener("storage", event => { if (event.key === BTB_SESSION_STORAGE) { identityKey = ""; clearBtbPublicCapabilities(); } });
}

async function publicToken(page: string, write: boolean): Promise<string> {
  const issuedGeneration = generation;
  const key = `${page}:${write ? "write" : "read"}`;
  let capability = capabilities.get(key);
  if (!capability || Date.parse(capability.expiresAt) <= Date.now() + 60_000) {
    let pending = fetching.get(key);
    if (!pending) {
      const controller = new AbortController();
      const promise = (async () => {
        const response = await fetch(`/api/btb/public-token?page=${encodeURIComponent(page)}&mode=${write ? "write" : "read"}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (!response.ok) throw new Error("This BTB page could not be authorized. Sign in again or retry.");
        const value = await response.json() as Capability;
        if (controller.signal.aborted || generation !== issuedGeneration) throw new DOMException("The BTB session changed.", "AbortError");
        if (!/^[0-9a-f]{64}$/.test(value.token) || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error("The workspace connection could not be authorized.");
        capabilities.set(key, value);
        return value;
      })().finally(() => { if (fetching.get(key)?.controller === controller) fetching.delete(key); });
      pending = { promise, controller };
      fetching.set(key, pending);
    }
    capability = await pending.promise;
  }
  if (generation !== issuedGeneration) throw new DOMException("The BTB session changed.", "AbortError");
  return capability.token;
}

export function btbPublicFetch(base: string, anonKey: string): typeof fetch {
  return async (input, init) => {
    listenForSessionChanges();
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const inBtb = pathname === "/btb/demo" || pathname.startsWith("/btb/demo/");
    if (workspace !== pathname) { clearBtbPublicCapabilities(); workspace = pathname; }
    if (inBtb && url.origin === new URL(base).origin && url.pathname.startsWith("/rest/v1/")) {
      const issuedGeneration = generation;
      const controller = new AbortController();
      requests.add(controller);
      const original = new Request(input, init);
      const request = new Request(original, { signal: AbortSignal.any([original.signal, controller.signal]) });
      const checkSession = () => {
        if (controller.signal.aborted || generation !== issuedGeneration || window.location.pathname !== pathname) {
          throw new DOMException("The BTB session changed.", "AbortError");
        }
      };
      try {
        const scope = btbBrowserScope(url.pathname, request.method, pathname);
        request.headers.delete("x-btb-public-token");
        if (scope) request.headers.set("x-btb-public-token", await publicToken(scope.page, scope.write));
        // Check after the await too: clearing between token resolution and this
        // continuation must not dispatch a request under the previous identity.
        checkSession();
        // A simultaneous FoodSafe login never selects its different RLS context.
        request.headers.set("authorization", `Bearer ${anonKey}`);
        const response = await fetch(request);
        // PostgREST replies are buffered JSON. Keep the abort/generation fence
        // until the full body arrives, not only until fetch resolves its headers.
        // Returning the original response preserves its URL/headers/status.
        if (response.body) await response.clone().arrayBuffer();
        checkSession();
        if ([401, 403].includes(response.status)) clearBtbPublicCapabilities();
        return response;
      } finally { requests.delete(controller); }
    }
    return fetch(input, init);
  };
}
