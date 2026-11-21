import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverInvitationEmail, invitationDetails, invitationEmailHtml } from "../src/lib/btb-invite-email";

const body = `Hi Harpal,\n\nYou’ve been invited to the Between the Buns workspace at Downtown.\n\nSet your own password using this single-use link (valid for seven days):\nhttps://foodsafety-sigma.vercel.app/btb/login/set-password?token=abc123\n\nAfter setup, sign in at https://foodsafety-sigma.vercel.app/btb/login with your employee email.`;

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

test("an immediate send settles the outbox row and never leaks the recipient", async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.BTB_EMAIL_FROM };
  process.env.RESEND_API_KEY = "test-only-provider-key";
  process.env.BTB_EMAIL_FROM = "Between the Buns <onboarding@resend.dev>";
  const calls: { table: string; update: Record<string, unknown>; id: string }[] = [];
  const db = {
    from(table: string) {
      return { update(update: Record<string, unknown>) { return { eq(_column: string, id: string) { return { in() { calls.push({ table, update, id }); return Promise.resolve({ error: null }); } }; } }; } };
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 })) as typeof fetch;
  try {
    const result = await deliverInvitationEmail(db as never, { id: "job-1", recipient: "harpal@example.test", subject: "Your invitation", body, attempts: 0 });
    assert.equal(result.status, "accepted");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "btb_email_jobs");
    assert.equal(calls[0].update.status, "accepted");
    assert.equal(calls[0].update.provider_id, "email_123");
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
  const db = {
    from() {
      return { update(update: Record<string, unknown>) { calls.push(update); return { eq() { return { in() { return Promise.resolve({ error: null }); } }; } }; } };
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "You can only send testing emails to your own email address." }), { status: 403 })) as typeof fetch;
  try {
    const result = await deliverInvitationEmail(db as never, { id: "job-2", recipient: "harpal@example.test", subject: "Your invitation", body, attempts: 0 });
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /HTTP 403/);
    assert.match(result.error ?? "", /testing emails/);
    assert.equal(calls[0].status, "failed");
    assert.equal(calls[0].attempts, 1);
  } finally {
    globalThis.fetch = original;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.BTB_EMAIL_FROM; else process.env.BTB_EMAIL_FROM = saved.from;
  }
});
