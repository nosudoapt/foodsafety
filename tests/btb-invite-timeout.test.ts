import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fetchJson, RequestError } from "../src/lib/fetch-json";

const read = (...parts: string[]) => readFileSync(join(__dirname, "..", "..", ...parts), "utf8");

// "signal timed out Your entries are still here." was the whole bug from the
// operator's side: a committed invitation that looked like a failure. These
// tests pin the three separates: the message, the response contract, and the
// retry safety.
test("a client timeout reads as a slow server, not a raw signal error", async () => {
  const original = globalThis.fetch;
  const timeout = new Error("signal timed out");
  timeout.name = "TimeoutError";
  globalThis.fetch = (async () => { throw timeout; }) as typeof fetch;
  try {
    await assert.rejects(fetchJson("/api/btb/admin/locations/x/people"), (error: unknown) =>
      error instanceof RequestError && error.status === 408 && /took too long/.test(error.message));
  } finally { globalThis.fetch = original; }
});

test("an unreachable site is distinguishable from a slow one", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  try {
    await assert.rejects(fetchJson("/api/x"), (error: unknown) =>
      error instanceof RequestError && error.status === 0 && /could not be reached/.test(error.message));
  } finally { globalThis.fetch = original; }
});

test("the invite answer is committed before the email is dispatched", () => {
  const lib = read("src", "lib", "btb-admin-invitations.ts");
  // The dispatch is returned as a closure, never awaited in the request path.
  assert.match(lib, /const dispatch = emailService\.senderConfigured/);
  assert.match(lib, /dispatch\?: \(\) => Promise<void>/);
  // The only delivery call lives inside the returned closure.
  assert.equal((lib.match(/deliverInvitationEmail\(/g) ?? []).length, 1);
  assert.match(lib, /dispatch = [\s\S]*?async \(\) => \{\s*await deliverInvitationEmail\(serviceDb\(\)/, "delivery is deferred");
  assert.match(lib, /email_status: dispatch \? "pending"/, "a queued send reports queued");
  // Cross-branch console sessions cannot touch another branch's row through the
  // pinned request client, so the outbox is settled by exact job id.
  assert.match(lib, /serviceDb\(\)/);

  for (const route of [
    ["src", "app", "api", "btb", "admin", "locations", "[locationId]", "people", "route.ts"],
    ["src", "app", "api", "btb", "admin", "locations", "[locationId]", "people", "[employeeId]", "route.ts"],
  ]) {
    const source = read(...route);
    assert.match(source, /import \{ after \} from "next\/server"/, `${route.at(-2)} must schedule after the response`);
    assert.match(source, /if \(dispatch\) after\(dispatch\)/);
    assert.match(source, /const \{ dispatch, \.\.\.receipt \}/);
  }
});

test("the invite buttons wait 20s and the provider is bounded", () => {
  const people = read("src", "components", "btb-admin", "People.tsx");
  assert.equal((people.match(/AbortSignal\.timeout\(20_000\)/g) ?? []).length, 2, "invite and person actions both");
  const mail = read("src", "lib", "btb-invite-email.ts");
  assert.match(mail, /AbortSignal\.timeout\(6_000\)/, "the provider call gives up inside the post-response window");
  // Claim before send: a superseded invitation's job is cancelled by the RPC.
  assert.match(mail, /\.in\("status", \["pending", "failed"\]\)\.select\("id"\)/);
  assert.match(mail, /if \(!claim\.data\?\.length\) return \{ status: "pending" \}/);
});

test("a retry after a timeout reuses the person and never duplicates them", () => {
  const sql = read("supabase", "schema-btb-invite-idempotent.sql");
  assert.match(sql, /ELSIF person\.restaurant_name<>'Between the Buns' OR person\.role<>v_role THEN/,
    "a differently typed name must not block the retry, but authority still does");
  assert.match(sql, /ON CONFLICT DO NOTHING/, "the membership stays idempotent");
  assert.match(sql, /pg_advisory_xact_lock/, "concurrent retries serialise on the email");
});
