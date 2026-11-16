import { test } from "node:test";
import assert from "node:assert/strict";
import { BtbApiError, failureDetails, publicFailure, publicPlatformFailure } from "../src/lib/api-errors";
import { replaceRows } from "../src/lib/persist-replace";

const secret = "QA_SENTINEL_SECRET private-person@test.invalid internal-db:5432";
test("HTTP-16: arbitrary dependency messages and forged status properties are never public errors", () => {
  for (const error of [new Error(secret), { message: secret, status: 400 }, secret, null]) {
    assert.equal(publicFailure(error).status, 503);
    assert.ok(!JSON.stringify(publicFailure(error)).includes("QA_SENTINEL"));
    assert.ok(!JSON.stringify(failureDetails(error)).includes("QA_SENTINEL"));
  }
  assert.deepEqual(publicFailure(new BtbApiError("Please reload.", 409)), { error: "Please reload.", status: 409 });
});

test("HTTP-16: SQL authorization/version/validation failures preserve status without raw SQL text", () => {
  for (const [code, status] of [["42501",403],["40001",409],["23514",400],["22023",400],["42P01",503],["XX000",503]] as const) {
    const error = publicPlatformFailure(secret, code, "The check could not be saved.");
    assert.equal(error.status, status);
    assert.ok(!JSON.stringify(publicFailure(error)).includes("QA_SENTINEL"));
    assert.equal((failureDetails(error).cause as { code: string }).code, code);
  }
});

test("HTTP-16: failed compensation stays CRITICAL with recovery instructions but no DB text", async () => {
  const result = await replaceRows({ label: "count sheet save",
    backup: async () => ({ rows: [{ qty: 2 }], error: null }),
    del: async () => ({ error: null }),
    ins: async () => ({ inserted: 0, error: { message: secret } }),
    restore: async () => ({ error: { message: secret } }),
  });
  assert.equal(result.recovered, false);
  assert.match(result.message!, /CRITICAL[\s\S]*re-enter/);
  assert.ok(!result.message!.includes("QA_SENTINEL"));
});
