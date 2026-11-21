import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changeBtbAdminPassword } from "../src/lib/btb-admin-password";
import { hashEmployeePassword, verifyEmployeePassword } from "../src/lib/btb-passwords";
import { jsonRows, queryClient } from "./helpers/query-client";

const admin = { id: "40000000-0000-4000-8000-000000000001", name: "Console Admin", email: "console@test.invalid", sessionVersion: 3 };

test("console password change verifies the current secret and rotates the version-guarded hash", async () => {
  const current = await hashEmployeePassword("old console passphrase");
  const { client, requests } = queryClient(request => request.method === "PATCH"
    ? jsonRows({ session_version: 4 })
    : jsonRows({ password_hash: current }));

  assert.deepEqual(await changeBtbAdminPassword(client, admin, "old console passphrase", "a much better passphrase"), { sessionVersion: 4 });
  const patch = requests.find(request => request.method === "PATCH");
  assert.ok(patch, "the credential write happened");
  assert.ok(patch!.url.includes("session_version=eq.3"), "the update is limited to the session's current version");
  assert.ok(patch!.url.includes("active=eq.true"), "a deactivated admin cannot rotate the credential");
  const body = JSON.parse(await patch!.text()) as { password_hash: string; session_version: number };
  assert.equal(body.session_version, 4);
  assert.equal(await verifyEmployeePassword("a much better passphrase", body.password_hash), true);
  assert.equal(await verifyEmployeePassword("old console passphrase", body.password_hash), false);
  assert.ok(requests.filter(request => request.method === "PATCH").length === 1);
});

test("console password change rejects a wrong current password without writing", async () => {
  const current = await hashEmployeePassword("old console passphrase");
  const { client, requests } = queryClient(() => jsonRows({ password_hash: current }));
  await assert.rejects(changeBtbAdminPassword(client, admin, "not my password", "another long passphrase"),
    error => (error as { status: number }).status === 400);
  assert.equal(requests.some(request => request.method === "PATCH"), false);
});

test("console password change validates length before touching the database", async () => {
  const { client, requests } = queryClient();
  await assert.rejects(changeBtbAdminPassword(client, admin, "anything", "short"), /10 to 128 characters/);
  assert.equal(requests.length, 0);
});

test("console password change fails closed when the version moved underneath it", async () => {
  const current = await hashEmployeePassword("old console passphrase");
  const { client } = queryClient(request => request.method === "PATCH" ? jsonRows(null) : jsonRows({ password_hash: current }));
  await assert.rejects(changeBtbAdminPassword(client, admin, "old console passphrase", "another long passphrase"),
    error => (error as { status: number }).status === 409);
});

test("the password route re-signs the current cookie with the new version", () => {
  const route = readFileSync(join(__dirname, "..", "..", "src/app/api/btb/admin/password/route.ts"), "utf8");
  assert.match(route, /requireBtbOrigin/);
  assert.match(route, /changeBtbAdminPassword/);
  assert.match(route, /version:\s*result\.sessionVersion/);
  assert.match(route, /BTB_ADMIN_COOKIE/);
  assert.ok(!/BTB_COOKIE/.test(route), "the demo cookie is never touched");
});
