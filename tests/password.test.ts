import { test } from "node:test";
import assert from "node:assert/strict";
import { strengthOf, looksLikeEmail, MIN_LENGTH } from "../src/lib/password";

test("the minimum length is 8 and is enforced", () => {
  assert.equal(MIN_LENGTH, 8);
  assert.equal(strengthOf("Abcdef1!").checks[0].met, true);
  assert.equal(strengthOf("Abcdef1").checks[0].met, false); // 7 chars
});

test("level equals the number of requirements met", () => {
  assert.equal(strengthOf("").level, 0);
  assert.equal(strengthOf("abc").level, 0);
  assert.equal(strengthOf("abcdefgh").level, 1); // length only
  assert.equal(strengthOf("Abcdefgh").level, 2); // length + case
  assert.equal(strengthOf("Abcdefg1").level, 3); // + number
  assert.equal(strengthOf("Abcdefg1!").level, 4); // + symbol
});

test("labels follow the level", () => {
  assert.equal(strengthOf("").label, "");
  assert.equal(strengthOf("abcdefgh").label, "Weak");
  assert.equal(strengthOf("Abcdefgh").label, "Fair");
  assert.equal(strengthOf("Abcdefg1").label, "Good");
  assert.equal(strengthOf("Abcdefg1!").label, "Strong");
});

test("a password is only valid with length AND mixed case", () => {
  assert.equal(strengthOf("").valid, false);
  assert.equal(strengthOf("abcdefgh").valid, false, "long but single-case");
  assert.equal(strengthOf("Abcdefgh").valid, true, "long and mixed case");
  assert.equal(strengthOf("AbCd1").valid, false, "mixed case but too short");
  assert.equal(strengthOf("ABCDEFGH").valid, false, "upper only");
  assert.equal(strengthOf("12345678").valid, false, "digits only");
});

test("a passphrase with no symbol or digit is still valid at length + case", () => {
  // We deliberately don't force symbols — that pushes people to 'Password1!'.
  assert.equal(strengthOf("correctHorse").valid, true);
  assert.equal(strengthOf("correctHorse").level, 2);
});

test("checks carry stable keys and human labels", () => {
  const { checks } = strengthOf("Abcdefg1!");
  assert.deepEqual(
    checks.map((c) => c.key),
    ["len", "case", "num", "sym"]
  );
  for (const c of checks) assert.ok(c.label.length > 0);
  assert.ok(checks.every((c) => c.met));
});

test("unicode and spaces don't crash the symbol check", () => {
  assert.doesNotThrow(() => strengthOf("Pässwörd1!"));
  assert.equal(strengthOf("Pässwörd1!").checks[2].met, true);
  assert.equal(strengthOf("Pass word1!").valid, true); // spaces count as symbols
});

test("looksLikeEmail accepts normal addresses", () => {
  for (const v of [
    "a@b.co",
    "owner@foodsafe.demo",
    "first.last+tag@restaurant-group.co.uk",
    "  padded@example.com  ",
  ]) {
    assert.equal(looksLikeEmail(v), true, `${v} should pass`);
  }
});

test("looksLikeEmail rejects obvious mistakes", () => {
  for (const v of ["", "nope", "a@b", "a b@c.com", "@example.com", "a@", "a@@b.com"]) {
    assert.equal(looksLikeEmail(v), false, `${v} should fail`);
  }
});