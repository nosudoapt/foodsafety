import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { acceptBtbInvitation, createBtbInvitation, invitationTokenHash, lookupBtbInvitation, validInvitationToken } from "../src/lib/btb-invitations";
import { btbInvitationDeliveryLabel, validateBtbAdminLocation, validateBtbAdminPerson } from "../src/lib/btb-admin";
import { verifyEmployeePassword } from "../src/lib/btb-passwords";
import { queryClient, jsonRows } from "./helpers/query-client";

const token = "a".repeat(64);
const info = { name: "Casey", email: "casey@test.invalid", location: "BTB East", expires_at: "2026-12-01T00:00:00Z" };

test("invitation links use independent 256-bit tokens, SHA-256 hashes and only the setup route", () => {
  const first = createBtbInvitation("https://app.example.test/btb/admin?ignored=true", info.name, info.location);
  const second = createBtbInvitation("https://app.example.test", info.name, info.location);
  const url = new URL(first.link);
  const raw = url.searchParams.get("token")!;
  assert.ok(validInvitationToken(raw)); assert.notEqual(first.link, second.link);
  assert.equal(url.origin, "https://app.example.test"); assert.equal(url.pathname, "/auth/set-password");
  assert.equal(url.searchParams.has("ignored"), false);
  assert.equal(first.tokenHash, createHash("sha256").update(raw).digest("hex"));
  assert.notEqual(first.tokenHash, raw); assert.ok(first.body.includes(first.link));
  assert.ok(first.body.includes("single-use") && first.body.includes("seven days"));
  for (const bad of ["javascript:alert(1)", "https://user:password@app.example.test", "not a url"]) assert.throws(() => createBtbInvitation(bad, "Casey", "East"));
  for (const bad of [null, "", "A".repeat(64), "a".repeat(63), "a".repeat(65), "../" + token]) assert.equal(validInvitationToken(bad), false);
});

test("token lookups expose only the intended setup identity, never hashes or ids", async () => {
  const { client, requests } = queryClient(() => jsonRows({ ...info, token_hash: "secret", employee_id: "private", password_hash: "private" }));
  assert.deepEqual(await lookupBtbInvitation(client, token), info);
  assert.deepEqual(await requests[0].json(), { p_token_hash: invitationTokenHash(token) });
  await assert.rejects(lookupBtbInvitation(client, "bad"), error => (error as { status: number }).status === 410);
  assert.equal(requests.length, 1, "Malformed tokens never reach the DB");
  const gone = queryClient(() => jsonRows(null));
  await assert.rejects(lookupBtbInvitation(gone.client, token), error => (error as { status: number }).status === 410);
  const failed = queryClient(() => new Response(JSON.stringify({ code: "42P01" }), { status: 404 }));
  await assert.rejects(lookupBtbInvitation(failed.client, token), error => (error as { status: number }).status === 503);
});

test("password setup validates and rate limits before salted credential writes", async () => {
  const id = "40000000-0000-4000-8000-000000000002";
  const { client, requests } = queryClient(request => jsonRows(request.url.endsWith("btb_invitation_lookup") ? info : request.url.endsWith("btb_consume_login_attempt") ? true : { id, name: "Casey", role: "staff", session_version: 2 }));
  assert.deepEqual(await acceptBtbInvitation(client, token, "Personal test passphrase"), { id, name: "Casey", role: "staff", version: 2 });
  assert.deepEqual(requests.map(request => new URL(request.url).pathname.split("/").at(-1)), ["btb_invitation_lookup", "btb_consume_login_attempt", "btb_invitation_consume"]);
  const consume = await requests[2].json();
  assert.equal(consume.p_token_hash, invitationTokenHash(token));
  assert.match(consume.p_password_hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.ok(await verifyEmployeePassword("Personal test passphrase", consume.p_password_hash));
  assert.equal("password" in consume, false); assert.equal("token" in consume, false);
  for (const bad of [null, "short", "a".repeat(129)]) await assert.rejects(acceptBtbInvitation(client, token, bad), error => (error as { status: number }).status === 400);
  assert.equal(requests.length, 3);
  const limited = queryClient(request => jsonRows(request.url.endsWith("btb_invitation_lookup") ? info : false));
  await assert.rejects(acceptBtbInvitation(limited.client, token, "Personal test passphrase"), error => (error as { status: number }).status === 429);
  assert.equal(limited.requests.length, 2);
  const raced = queryClient(request => request.url.endsWith("btb_invitation_consume") ? new Response(JSON.stringify({ code: "22023", message: "Invitation already used" }), { status: 400 }) : jsonRows(request.url.endsWith("btb_invitation_lookup") ? info : true));
  await assert.rejects(acceptBtbInvitation(raced.client, token, "Personal test passphrase"), error => (error as { status: number }).status === 410);
});

test("console location/person input cannot create demo credentials or elevated roles", () => {
  const site = { name: "East", address: "12 Main", timezone: "America/Regina", active: true, version: 1 };
  assert.equal(validateBtbAdminLocation(site, true), null);
  for (const bad of [{ ...site, timezone: "Mars/Here" }, { ...site, name: " " }, { ...site, active: "true" }, { ...site, version: "1" }, { ...site, pages: ["admin"] }, { ...site, pages: ["platform", "platform"] }]) assert.ok(validateBtbAdminLocation(bad, true));
  const person = { name: "Casey", email: "CASEY@test.invalid", role: "staff" };
  assert.equal(validateBtbAdminPerson(person), null);
  for (const bad of [{ ...person, email: "staff@btb.demo" }, { ...person, role: "admin" }, { ...person, role: "owner" }, { ...person, role: "corporate" }, { ...person, name: "Casey\nBcc: outside" }, { ...person, email: "a@test.invalid,b@test.invalid" }]) assert.ok(validateBtbAdminPerson(bad));
});

test("invitation status distinguishes password acceptance from provider acceptance and enqueue", () => {
  const invitation = { ...info, created_at: "2026-11-19T00:00:00Z", used_at: null, email_status: "pending" as const, email_error: null };
  const now = Date.parse("2026-11-20T00:00:00Z");
  assert.equal(btbInvitationDeliveryLabel(null, now), "No invitation on record");
  assert.equal(btbInvitationDeliveryLabel(invitation, now), "Email queued");
  assert.equal(btbInvitationDeliveryLabel({ ...invitation, email_status: "accepted" }, now), "Email provider accepted");
  assert.equal(btbInvitationDeliveryLabel({ ...invitation, email_status: "failed" }, now), "Email failed · retry pending");
  assert.equal(btbInvitationDeliveryLabel({ ...invitation, used_at: "2026-11-19T01:00:00Z" }, now), "Password set");
  assert.equal(btbInvitationDeliveryLabel(invitation, Date.parse(info.expires_at)), "Link expired");
});

test("invitation transport binds actor/recipient server-side and only missing email exposes a manual link", () => {
  const root = join(__dirname, "..", "..");
  const source = readFileSync(join(root, "src/lib/btb-admin-invitations.ts"), "utf8");
  assert.ok(source.includes("btbAdminLocation(context, locationId)"));
  assert.ok(source.includes("existing.name") && source.includes("p_employee: person.id"));
  assert.ok(source.includes("p_body: invitation.body") && source.includes("p_token_hash: invitation.tokenHash"));
  assert.ok(source.includes("!emailService.senderConfigured ? { manualLink: invitation.link } : {}"));
  assert.ok(!source.includes("x-forwarded-host"));
  const setup = readFileSync(join(root, "src/app/auth/set-password/layout.tsx"), "utf8");
  assert.ok(setup.includes('referrer: "no-referrer"') && setup.includes("index: false"));
});
