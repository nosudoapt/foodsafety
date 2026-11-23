import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { authenticateBtbAdmin, BTB_ADMIN_COOKIE, BTB_ADMIN_MAX_AGE, btbAdminClaimsFromSession, btbAdminIdentityFromSession, btbAdminSessionValueFor, btbAdminSigningKey } from "../src/lib/btb-admin-auth";
import { employeeSessionValueFor, roleFromSession, sessionValueFor } from "../src/lib/btb-auth";
import { hashEmployeePassword } from "../src/lib/btb-passwords";
import { queryClient, jsonRows } from "./helpers/query-client";

process.env.SUPABASE_SERVICE_ROLE_KEY = "admin-test-only-service-key";
const id = "40000000-0000-4000-8000-000000000001";
const root = join(__dirname, "..", "..");

test("console cookie/signing contexts are independent and bind id, version and expiry", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const value = btbAdminSessionValueFor({ id, version: 3 }, now);
  assert.equal(BTB_ADMIN_COOKIE, "btb_admin_session");
  assert.deepEqual(btbAdminClaimsFromSession(value, now), { id, version: 3, expires: now / 1000 + BTB_ADMIN_MAX_AGE });
  assert.equal(btbAdminClaimsFromSession(value, now + BTB_ADMIN_MAX_AGE * 1000), null);
  assert.equal(roleFromSession(value), null);
  for (const demo of [sessionValueFor("admin"), sessionValueFor("manager"), employeeSessionValueFor({ id, role: "owner", version: 3 }, now)])
    assert.equal(btbAdminClaimsFromSession(demo, now), null);
  for (const invalid of [null, "", value + ".extra", value.slice(0, -1), value.replace(/^admin/, "employee")]) assert.equal(btbAdminClaimsFromSession(invalid, now), null);
  const [, payload, signature] = value.split(".");
  const altered = Buffer.from(JSON.stringify({ ...btbAdminClaimsFromSession(value, now), id: "40000000-0000-4000-8000-000000000002" })).toString("base64url");
  assert.equal(btbAdminClaimsFromSession(`admin.${altered}.${signature}`, now), null);
  const employeeSignature = createHmac("sha256", btbAdminSigningKey()).update(`btb-employee:${payload}`).digest("hex");
  assert.equal(btbAdminClaimsFromSession(`admin.${payload}.${employeeSignature}`, now), null);
});

test("console sessions reject signed malformed claims and rotate with the backend key", () => {
  const now = Date.now();
  for (const data of [{ id: "bad", version: 1 }, { id, version: 0 }, { id, version: 1.5 }, { id, version: "1" }])
    assert.equal(btbAdminClaimsFromSession(btbAdminSessionValueFor(data as { id: string; version: number }, now), now), null);
  const value = btbAdminSessionValueFor({ id, version: 1 }, now);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated-admin-test-key";
  assert.equal(btbAdminClaimsFromSession(value, now), null);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.throws(() => btbAdminSessionValueFor({ id, version: 1 }), /not configured/);
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
});

test("console status and credential version are rechecked without reading password hashes", async () => {
  const value = btbAdminSessionValueFor({ id, version: 3 });
  for (const row of [null, { id, active: false, session_version: 3 }, { id, active: true, session_version: 2 }]) {
    const { client } = queryClient(() => jsonRows(row));
    assert.equal(await btbAdminIdentityFromSession(value, client), null);
  }
  const { client, requests } = queryClient(() => jsonRows({ id, active: true, session_version: 3, name: "Console Admin", email: "admin@test.invalid" }));
  assert.deepEqual(await btbAdminIdentityFromSession(value, client), { id, sessionVersion: 3, name: "Console Admin", email: "admin@test.invalid" });
  assert.ok(requests.every(request => new URL(request.url).pathname.endsWith("/btb_super_admins") && !request.url.includes("password_hash")));
  const unavailable = queryClient(() => new Response(JSON.stringify({ code: "42P01" }), { status: 404 }));
  await assert.rejects(btbAdminIdentityFromSession(value, unavailable.client), /console is not available/);
});

test("console sign-in uses only its own table, failure counter and salted credentials", async () => {
  const password = "Console test passphrase";
  const password_hash = await hashEmployeePassword(password);
  const row = { id, name: "Console Admin", email: "admin@test.invalid", active: true, session_version: 1, password_hash };
  const rpc = (request: Request) => {
    if (request.url.includes("btb_auth_check_ip")) return jsonRows([{ blocked: false, retry_after: 0 }]);
    if (request.url.includes("btb_auth_note_failure")) return jsonRows([{ blocked: false, attempts: 1, retry_after: 900 }]);
    if (request.url.includes("btb_auth_note_success")) return jsonRows(null);
    return jsonRows(new URL(request.url).pathname.includes("/rpc/") ? true : row);
  };
  const { client, requests } = queryClient(rpc);
  assert.deepEqual(await authenticateBtbAdmin(client, " ADMIN@test.invalid ", password, "203.0.113.9"), { id, name: row.name, email: row.email, sessionVersion: 1 });
  assert.ok(requests.some(request => request.url.includes("btb_auth_check_ip")));
  assert.ok(requests.some(request => request.url.includes("btb_auth_note_success")));
  assert.ok(requests.some(request => request.method === "PATCH"));
  assert.ok(requests.every(request => !/btb_employees|btb_employee_credentials|btb_consume_login_attempt/.test(request.url)));
  for (const email of ["admin@btb.demo", "manager@btb.demo"]) await assert.rejects(authenticateBtbAdmin(client, email, password), error => (error as { status: number }).status === 401);
  await assert.rejects(authenticateBtbAdmin(client, row.email, "wrong-password"), error => (error as { status: number }).status === 401);
  const missing = queryClient(request => request.url.includes("/rpc/")
    ? jsonRows(request.url.includes("btb_auth_note_failure") ? [{ blocked: false, attempts: 1, retry_after: 900 }] : [{ blocked: false, retry_after: 0 }])
    : jsonRows(null));
  await assert.rejects(authenticateBtbAdmin(missing.client, row.email, password), error => (error as { status: number }).status === 401);
  // A blocked network is refused before the password is even looked at.
  const limited = queryClient(() => jsonRows([{ blocked: true, retry_after: 600 }]));
  await assert.rejects(authenticateBtbAdmin(limited.client, row.email, password), error => (error as { status: number }).status === 429);
});

test("console guards and logout share the one workspace session and never touch a legacy cookie", () => {
  const api = readFileSync(join(root, "src/lib/btb-admin-api.ts"), "utf8");
  assert.ok(api.includes("requireWorkspaceSession()"), "the console authorizes from the verified session");
  assert.ok(api.includes('principalType !== "console"'), "only a console principal may enter");
  assert.ok(!api.includes("BTB_ADMIN_COOKIE"), "the console cookie is retired");
  assert.ok(!api.includes("BTB_COOKIE"), "the store cookie is retired");
  // The legacy console door is deleted, and sign-out is the unified one.
  assert.equal(existsSync(join(root, "src/app/api/btb/admin/login/route.ts")), false);
  const logout = readFileSync(join(root, "src/app/api/auth/logout/route.ts"), "utf8");
  assert.ok(logout.includes("revokeWorkspaceSession"), "logout revokes the durable session row");
  assert.ok(!/BTB_ADMIN_COOKIE|BTB_COOKIE|supabase\.auth/.test(logout));
  const offenders: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(file)) {
        const source = readFileSync(file, "utf8");
        if (/^["']use client["']/m.test(source) && /from\s+["'][^"']*btb-admin-auth["']/.test(source)) offenders.push(file);
      }
    }
  };
  walk(join(root, "src")); assert.deepEqual(offenders, []);
});
