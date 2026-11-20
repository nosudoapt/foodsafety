import { test } from "node:test";
import assert from "node:assert/strict";
import { btbPublicFetch, clearBtbPublicCapabilities, syncBtbCapabilityIdentity, announceBtbSessionChange, BTB_SESSION_STORAGE } from "../src/lib/btb-public-fetch";

test("browser capabilities isolate page/mode/product and fence identity, expiry and late-token races", async t => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stored = new Map<string, string>();
  const windowFixture = Object.assign(new EventTarget(), { location: { pathname: "/btb/demo/emergency" }, localStorage: { setItem: (key: string, value: string) => stored.set(key, value) } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowFixture });
  const base = "https://db.fixture.test";
  const sent: Request[] = [];
  const issued: string[] = [];
  let count = 0;
  let expired = false;
  let resolveToken: ((response: Response) => void) | null = null;
  let pause = false;
  let pendingSignal: AbortSignal | null = null;
  let resolveData: ((response: Response) => void) | null = null;
  let pauseData = false;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/btb/public-token")) {
      issued.push(url); count++;
      if (pause) { pendingSignal = init?.signal ?? null; return new Promise<Response>(resolve => { resolveToken = resolve; }); }
      return Response.json({ token: count.toString(16).padStart(64, "0"), expiresAt: new Date(Date.now() + (expired ? 30_000 : 600_000)).toISOString() });
    }
    sent.push(new Request(input, init));
    if (pauseData) return new Promise<Response>(resolve => { resolveData = resolve; });
    return Response.json([]);
  };
  const client = btbPublicFetch(base, "anon-key");
  const get = () => client(`${base}/rest/v1/emergency_contacts`, { headers: { authorization: "Bearer unrelated-foodsafe-user", "x-btb-public-token": "forged" } });
  try {
    await t.test("read/write caches and cross-page requests never inherit FoodSafe authorization", async () => {
      syncBtbCapabilityIdentity({ employeeId: "employee-a", role: "manager", sessionVersion: 1 });
      await get(); await get();
      assert.equal(issued.length, 1);
      assert.match(issued[0], /page=emergency&mode=read/);
      assert.equal(sent[0].headers.get("authorization"), "Bearer anon-key");
      assert.notEqual(sent[0].headers.get("x-btb-public-token"), "forged");
      await client(`${base}/rest/v1/emergency_contacts`, { method: "POST" });
      assert.match(issued[1], /mode=write/);
      await client(`${base}/rest/v1/login_vault`, { headers: { "x-btb-public-token": "forged", authorization: "Bearer unrelated-foodsafe-user" } });
      assert.equal(issued.length, 2);
      assert.equal(sent.at(-1)!.headers.get("x-btb-public-token"), null);
      windowFixture.location.pathname = "/admin/vault";
      await client(`${base}/rest/v1/login_vault`, { headers: { authorization: "Bearer foodsafe" } });
      assert.equal(sent.at(-1)!.headers.get("authorization"), "Bearer foodsafe");
    });
    await t.test("identity/version/navigation and near-expiry clear the cache", async () => {
      windowFixture.location.pathname = "/btb/demo/emergency";
      const before = issued.length;
      await get();
      syncBtbCapabilityIdentity({ employeeId: "employee-a", role: "manager", sessionVersion: 2 });
      await get();
      syncBtbCapabilityIdentity({ employeeId: "employee-b", role: "manager", sessionVersion: 2 });
      expired = true; await get(); await get(); expired = false;
      assert.equal(issued.length, before + 4);
    });
    await t.test("clearing concurrent token requests aborts and rejects a late response without repopulating", async () => {
      clearBtbPublicCapabilities(); pause = true;
      const beforeIssued = issued.length, beforeSent = sent.length;
      const first = get(), second = get();
      const failures = Promise.all([assert.rejects(first, { name: "AbortError" }), assert.rejects(second, { name: "AbortError" })]);
      assert.equal(issued.length, beforeIssued + 1, "same page/mode shares its pending request");
      clearBtbPublicCapabilities();
      assert.equal((pendingSignal as AbortSignal | null)?.aborted, true);
      (resolveToken as ((response: Response) => void) | null)!(Response.json({ token: "f".repeat(64), expiresAt: new Date(Date.now() + 600_000).toISOString() }));
      await failures;
      assert.equal(sent.length, beforeSent, "the stale bearer never authorizes a database request");
      pause = false; await get();
      assert.equal(issued.length, beforeIssued + 2, "a late result cannot refill the cache");
      assert.notEqual(sent.at(-1)!.headers.get("x-btb-public-token"), "f".repeat(64));
    });
    await t.test("cross-tab reset signals carry no bearer or identity", async () => {
      announceBtbSessionChange();
      assert.deepEqual([...stored.keys()], [BTB_SESSION_STORAGE]);
      assert.match(stored.get(BTB_SESSION_STORAGE)!, /^[0-9a-f-]{36}$/);
      const before = issued.length;
      await get();
      const storage = new Event("storage"); Object.defineProperty(storage, "key", { value: BTB_SESSION_STORAGE });
      windowFixture.dispatchEvent(storage);
      await get();
      assert.equal(issued.length, before + 2);
    });
    await t.test("a late database response is aborted and cannot reach the next identity", async () => {
      pauseData = true;
      const pending = get();
      const failed = assert.rejects(pending, { name: "AbortError" });
      // Allow the cached-token await to dispatch the actual data request.
      await Promise.resolve(); await Promise.resolve();
      assert.ok(resolveData);
      syncBtbCapabilityIdentity({ employeeId: "employee-c", role: "staff", sessionVersion: 1 });
      assert.equal(sent.at(-1)!.signal.aborted, true);
      (resolveData as ((response: Response) => void) | null)!(Response.json([{ previousIdentitySecret: true }]));
      await failed;
      pauseData = false;
      await get();
      assert.equal(sent.at(-1)!.signal.aborted, false);
    });
    await t.test("a body arriving after its headers remains fenced until every byte is read", async () => {
      pauseData = true;
      let body: ReadableStreamDefaultController<Uint8Array> | null = null;
      const stream = new ReadableStream<Uint8Array>({ start(controller) { body = controller; } });
      const pending = get();
      const failed = assert.rejects(pending, { name: "AbortError" });
      await Promise.resolve(); await Promise.resolve();
      (resolveData as ((response: Response) => void) | null)!(new Response(stream, { headers: { "content-type": "application/json" } }));
      await Promise.resolve(); await Promise.resolve();
      syncBtbCapabilityIdentity({ employeeId: "employee-d", role: "manager", sessionVersion: 1 });
      assert.equal(sent.at(-1)!.signal.aborted, true, "receiving headers is not a completed data request");
      (body as ReadableStreamDefaultController<Uint8Array> | null)!.enqueue(new TextEncoder().encode('[{"previousIdentitySecret":true}]'));
      (body as ReadableStreamDefaultController<Uint8Array> | null)!.close();
      await failed;
      pauseData = false;
      const fresh = await get();
      assert.deepEqual(await fresh.json(), []);
    });
  } finally {
    clearBtbPublicCapabilities(); syncBtbCapabilityIdentity(null);
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
