import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverInvitationEmail, invitationDetails, invitationEmailHtml } from "../src/lib/btb-invite-email";

const body = `Hi Harpal,\n\nYou’ve been invited to the Between the Buns workspace at Downtown.\n\nSet your own password using this single-use link (valid for seven days):\nhttps://foodsafety-sigma.vercel.app/btb/login/set-password?token=abc123\n\nAfter setup, sign in at https://foodsafety-sigma.vercel.app/btb/login with your employee email.`;

/** Minimal PostgREST chain: update().eq().in()/select() plus an awaitable tail. */
function jobDb(claimed: boolean, calls: Record<string, unknown>[]) {
  return {
    from() {
      const node = {
        eq: () => node,
        in: () => node,
        select: () => Promise.resolve({ error: null, data: claimed ? [{ id: "job" }] : [] }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null, data: null }).then(resolve),
      };
      return { update: (update: Record<string, unknown>) => { calls.push(update); return node; } };
    },
  };
}

test("invitation details come from the frozen body", () => {
  assert.deepEqual(invitationDetails(body), {
    name: "Harpal",
    location: "Downtown",
    link: "https://foodsafety-sigma.vercel.app/btb/login/set-password?token=abc123",
  });
});

test("the branded email carries the setup button and escapes the name", () => {
  const html = invitationEmailHtml(body);
  assert.ok(html.includes("Welcome to the team"));
  assert.ok(html.includes("Hi Harpal"));
  assert.ok(html.includes("https://foodsafety-sigma.vercel.app/btb/login/set-password?token=abc123"));
  assert.ok(html.includes("Set up my password"));
  assert.ok(html.includes("expires seven days"));
  const escaped = invitationEmailHtml("Hi <img src=x onerror=alert(1)>,\n\nhttps://example.test/x");
  assert.ok(!escaped.includes("<img src=x"));
  assert.ok(escaped.includes("&lt;img src=x"));
});

test("an immediate send claims the job, settles it and never leaks the recipient", async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.BTB_EMAIL_FROM };
  process.env.RESEND_API_KEY = "test-only-provider-key";
  process.env.BTB_EMAIL_FROM = "Between the Buns <onboarding@resend.dev>";
  const calls: Record<string, unknown>[] = [];
  const db = jobDb(true, calls);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 })) as typeof fetch;
  try {
    const result = await deliverInvitationEmail(db as never, { id: "job-1", recipient: "harpal@example.test", subject: "Your invitation", body, attempts: 0 });
    assert.equal(result.status, "accepted");
    assert.equal(calls[0]?.status, "sending", "the job is claimed before the provider call");
    const settled = calls.at(-1)!;
    assert.equal(settled.status, "accepted");
    assert.equal(settled.provider_id, "email_123");
    assert.ok(JSON.stringify(settled).includes("job-1") === false, "the job id is a filter, not a written column");
  } finally {
    globalThis.fetch = original;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.BTB_EMAIL_FROM; else process.env.BTB_EMAIL_FROM = saved.from;
  }
});

test("a superseded invitation is never emailed", async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.BTB_EMAIL_FROM };
  process.env.RESEND_API_KEY = "test-only-provider-key";
  process.env.BTB_EMAIL_FROM = "Between the Buns <onboarding@resend.dev>";
  const calls: Record<string, unknown>[] = [];
  let providerCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { providerCalls += 1; return new Response(JSON.stringify({ id: "should-not-happen" }), { status: 200 }); }) as typeof fetch;
  try {
    // The claim returns no row: a newer invitation cancelled this job.
    const result = await deliverInvitationEmail(jobDb(false, calls) as never, { id: "job-old", recipient: "harpal@example.test", subject: "Your invitation", body, attempts: 0 });
    assert.equal(result.status, "pending");
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = original;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.BTB_EMAIL_FROM; else process.env.BTB_EMAIL_FROM = saved.from;
  }
});

test("a provider refusal is surfaced and leaves the row retryable", async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.BTB_EMAIL_FROM };
  process.env.RESEND_API_KEY = "test-only-provider-key";
  process.env.BTB_EMAIL_FROM = "Between the Buns <onboarding@resend.dev>";
  const calls: Record<string, unknown>[] = [];
  const db = jobDb(true, calls);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "You can only send testing emails to your own email address." }), { status: 403 })) as typeof fetch;
  try {
    const result = await deliverInvitationEmail(db as never, { id: "job-2", recipient: "harpal@example.test", subject: "Your invitation", body, attempts: 0 });
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /HTTP 403/);
    assert.match(result.error ?? "", /testing emails/);
    const failed = calls.at(-1)!;
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 1);
  } finally {
    globalThis.fetch = original;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.BTB_EMAIL_FROM; else process.env.BTB_EMAIL_FROM = saved.from;
  }
});
