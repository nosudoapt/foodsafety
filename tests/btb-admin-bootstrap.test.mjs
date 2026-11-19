import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseBootstrapArgs, bootstrapIdentity } from "../scripts/bootstrap-btb-admin-lib.mjs";

test("first-admin bootstrap validates real identities and accepts no password arguments", () => {
  const args = parseBootstrapArgs(["--email", " Admin@Example.test ", "--name", " A Person ", "--password-stdin", "--confirm"]);
  assert.deepEqual(bootstrapIdentity(args), { email: "admin@example.test", name: "A Person" });
  for (const input of [["--password", "secret"], ["--email"], ["--unknown"]]) assert.throws(() => parseBootstrapArgs(input));
  for (const email of ["admin@btb.demo", "staff@btb.demo", "bad", "a,b@example.test"]) assert.throws(() => bootstrapIdentity({ email, name: "A Person" }));
  assert.throws(() => bootstrapIdentity({ email: "admin@example.test", name: " " }));
});

test("bootstrap help is offline and source refuses overwrites under a transaction lock", () => {
  const output = execFileSync(process.execPath, ["scripts/bootstrap-btb-admin.mjs", "--help"], { encoding: "utf8", env: { ...process.env, SUPABASE_DB_URL: "postgres://not-a-real-db.invalid" } });
  assert.match(output, /FIRST|first/); assert.match(output, /hidden password/);
  const source = readFileSync(new URL("../scripts/bootstrap-btb-admin.mjs", import.meta.url), "utf8");
  assert.match(source, /pg_advisory_xact_lock/); assert.match(source, /current\.total/);
  assert.doesNotMatch(source, /UPDATE btb_super_admins|btb_employee_credentials|INSERT INTO btb_employees/);
});
