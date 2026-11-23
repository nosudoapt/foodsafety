import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_FAILURE_LIMIT, IP_FAILURE_LIMIT, WINDOW_SECONDS, firstAttemptRow, lockoutMessage, maskEmail } from "../src/lib/btb-login-guard";

test("a lockout message states the real remaining time", () => {
  assert.match(lockoutMessage(0), /in 1 minute/);
  assert.match(lockoutMessage(240), /in 4 minutes/);
  assert.match(lockoutMessage(45), /in 1 minute/);
  assert.match(lockoutMessage(null), /in 1 minute/);
  assert.doesNotMatch(lockoutMessage(600), /15 minutes/);
});

test("postgres table results are read as a row, not an array", () => {
  assert.deepEqual(firstAttemptRow([{ blocked: true, retry_after: 90 }]), { blocked: true, retry_after: 90 });
  assert.deepEqual(firstAttemptRow({ blocked: false }), { blocked: false });
  assert.deepEqual(firstAttemptRow([]), {});
  assert.deepEqual(firstAttemptRow(null), {});
});

test("console emails are masked but still recognisable", () => {
  assert.equal(maskEmail("nitpreetik13@gmail.com"), "ni******@gmail.com");
  assert.equal(maskEmail("ab@x.co"), "a***@x.co");
  assert.equal(maskEmail("broken"), "broken");
});

test("throttle limits leave room for a normal shift while still stopping guessing", () => {
  assert.equal(EMAIL_FAILURE_LIMIT, 10);
  assert.equal(IP_FAILURE_LIMIT, 30);
  assert.equal(WINDOW_SECONDS, 900);
  assert.ok(IP_FAILURE_LIMIT > EMAIL_FAILURE_LIMIT, "a shared restaurant network must not lock out a whole shift of typos");
});
