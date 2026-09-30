import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
} from "../src/lib/vault-crypto";

process.env.VAULT_ENC_KEY = Buffer.alloc(32, 7).toString("base64");

test("round-trips a secret", () => {
  const plain = "hunter2! correct horse battery staple";
  const cipher = encryptSecret(plain);
  assert.ok(isEncrypted(cipher));
  assert.notEqual(cipher, plain);
  assert.equal(decryptSecret(cipher), plain);
});

test("never leaks the plaintext into the stored value", () => {
  const cipher = encryptSecret("SuperSecret123");
  assert.ok(!cipher.includes("SuperSecret123"));
  assert.ok(cipher.startsWith("v1:"));
  assert.equal(cipher.split(":").length, 4);
});

test("fresh IV per call — same plaintext, different ciphertext", () => {
  const a = encryptSecret("same-input");
  const b = encryptSecret("same-input");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), "same-input");
  assert.equal(decryptSecret(b), "same-input");
});

test("handles unicode, empty-ish and long values", () => {
  for (const value of ["", "🔐 pin 1234", "a".repeat(4096)]) {
    assert.equal(decryptSecret(encryptSecret(value)), value);
  }
});

test("tampered auth tag is rejected", () => {
  const cipher = encryptSecret("do-not-tamper");
  const parts = cipher.split(":");
  parts[2] = Buffer.alloc(16, 1).toString("base64");
  assert.throws(() => decryptSecret(parts.join(":")));
});

test("truncated ciphertext is rejected", () => {
  assert.throws(() => decryptSecret("v1:aaaa"));
  assert.throws(() => decryptSecret("v1:aaaa:bbbb"));
});

test("anything outside the v1 format is treated as legacy plaintext", () => {
  assert.equal(decryptSecret("v2:aaaa:bbbb:cccc"), "v2:aaaa:bbbb:cccc");
  assert.equal(decryptSecret("plain-value"), "plain-value");
});

test("pre-encryption plaintext rows still reveal", () => {
  const legacy = "stored-before-this-feature";
  assert.equal(isEncrypted(legacy), false);
  assert.equal(decryptSecret(legacy), legacy);
});

test("wire format carries a 12-byte IV and 16-byte tag", () => {
  const [version, iv, tag, ciphertext] = encryptSecret("shape").split(":");
  assert.equal(version, "v1");
  assert.equal(Buffer.from(iv, "base64").length, 12);
  assert.equal(Buffer.from(tag, "base64").length, 16);
  assert.ok(Buffer.from(ciphertext, "base64").length > 0);
});
