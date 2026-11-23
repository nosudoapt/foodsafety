import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { authenticatePrincipal, claimsForWorkspace, sessionMatchesContext, type CredentialAdapter } from "../src/lib/workspace-auth-core";
import { signWorkspaceSession, verifyWorkspaceSession } from "../src/lib/workspace-session";
import { INVALID_LOGIN, NO_ACTIVE_WORKSPACE, normalizedEmail, type WorkspaceAuthContext } from "../src/lib/workspace-auth-types";
import { verifyWorkspacePassword } from "../src/lib/workspace-passwords";
import { hashEmployeePassword } from "../src/lib/btb-passwords";
import { hash } from "bcryptjs";

const context = (overrides: Partial<WorkspaceAuthContext> = {}): WorkspaceAuthContext => ({
  sub: randomUUID(), credentialId: randomUUID(), principalType: "employee", version: 1, sourceVersion: 1,
  active: true, principalActive: true, tenantId: randomUUID(), tenantSlug: "between-the-buns", tenantName: "Between the Buns",
  role: "staff", name: "Team member", email: "person@example.test", locations: [{ id: randomUUID(), name: "Assigned site", slug: "assigned" }], ...overrides,
});
test("email normalization is trim plus lowercase", () => assert.equal(normalizedEmail("  Person@Example.Test  "), "person@example.test"));
test("a wrong higher-priority password never tries a second store", async () => {
  const candidate = context({ principalType: "console", role: "admin" });
  const calls: string[] = [];
  const adapter: CredentialAdapter = {
    find: async email => { calls.push(`find:${email}`); return candidate; },
    verify: async principal => { calls.push(`verify:${principal?.principalType}`); return false; },
    verifyProvider: async () => { calls.push("provider"); return true; },
    context: async () => { calls.push("context"); return candidate; },
  };
  await assert.rejects(authenticatePrincipal(" PERSON@example.test ", "wrong", adapter), { message: INVALID_LOGIN });
  assert.deepEqual(calls, ["find:person@example.test", "verify:console"]);
});
test("unknown and disabled accounts do password work and fail identically", async () => {
  for (const candidate of [null, context({ active: false })]) {
    let checks = 0;
    const adapter: CredentialAdapter = { find: async () => candidate, verify: async () => { checks++; return true; }, verifyProvider: async () => true, context: async () => context() };
    await assert.rejects(authenticatePrincipal("person@example.test", "secret", adapter), { message: INVALID_LOGIN });
    assert.equal(checks, 1);
  }
});
test("only a verified password may reveal the missing-assignment message", async () => {
  const candidate = context({ locations: [] });
  const adapter: CredentialAdapter = { find: async () => candidate, verify: async () => true, verifyProvider: async () => true, context: async () => candidate };
  const authenticated = await authenticatePrincipal(candidate.email, "secret", adapter);
  assert.throws(() => claimsForWorkspace(authenticated, randomUUID()), { message: NO_ACTIVE_WORKSPACE });
});
test("concurrent credential rotation prevents session issuance", async () => {
  const candidate = context();
  const adapter: CredentialAdapter = { find: async () => candidate, verify: async () => true, verifyProvider: async () => true, context: async () => ({ ...candidate, version: 2 }) };
  await assert.rejects(authenticatePrincipal(candidate.email, "secret", adapter), { message: INVALID_LOGIN });
});
test("the signed cookie binds all authorization fields and rejects tampering and expiry", () => {
  const principal = context();
  const now = Date.now();
  const claims = claimsForWorkspace(principal, randomUUID(), undefined, now);
  const key = "a".repeat(64);
  const signed = signWorkspaceSession(claims, key);
  assert.deepEqual(verifyWorkspaceSession(signed, key, now), claims);
  assert.equal(verifyWorkspaceSession(signed, "b".repeat(64), now), null);
  const [prefix, payload, signature] = signed.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "owner", tenantId: randomUUID(), locationId: randomUUID() })).toString("base64url");
  assert.equal(verifyWorkspaceSession(`${prefix}.${forged}.${signature}`, key, now), null);
  assert.equal(verifyWorkspaceSession(signed, key, now + 12 * 60 * 60 * 1000), null);
  for (const old of ["employee.payload.signature", "admin.payload.signature", "staff-static-demo-token"]) assert.equal(verifyWorkspaceSession(old, key, now), null);
});
test("live tenant, role, assignment and version changes invalidate the signed scope", () => {
  const principal = context();
  const claims = claimsForWorkspace(principal, randomUUID());
  assert.equal(sessionMatchesContext(claims, principal), true);
  for (const changed of [ { ...principal, role: "owner" as const }, { ...principal, version: 2 }, { ...principal, tenantId: randomUUID() }, { ...principal, locations: [] } ]) assert.equal(sessionMatchesContext(claims, changed), false);
  assert.throws(() => claimsForWorkspace(principal, randomUUID(), randomUUID()), /not in your workspace/);
});
test("existing scrypt and bcrypt hashes both verify without conversion", async () => {
  const password = "OriginalSecret2026!";
  const employee = context({ passwordHash: await hashEmployeePassword(password) });
  const provider = context({ principalType: "supabase", passwordHash: await hash(password, 10) });
  for (const candidate of [employee, provider]) {
    assert.equal(await verifyWorkspacePassword(candidate, password), true);
    assert.equal(await verifyWorkspacePassword(candidate, "wrong"), false);
  }
  assert.equal(await verifyWorkspacePassword(null, password), false);
});
