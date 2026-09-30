import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFileSize } from "../src/lib/files";

test("human-readable byte sizes for the upload screens", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(1023), "1023 B");
  assert.equal(formatFileSize(1024), "1.0 KB");
  assert.equal(formatFileSize(2048), "2.0 KB");
  assert.equal(formatFileSize(1048576), "1.0 MB");
  assert.equal(formatFileSize(4.2 * 1048576), "4.2 MB");
});

test("missing sizes render a dash instead of NaN", () => {
  assert.equal(formatFileSize(null), "—");
  assert.equal(formatFileSize(undefined), "—");
  assert.equal(formatFileSize(NaN), "—");
});
