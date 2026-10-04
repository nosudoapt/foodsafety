import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STORAGE_BUCKETS, compressImage, uploadToSupabase } from "../src/lib/files";

const sql = readFileSync(join(__dirname, "../../supabase/schema-storage-buckets.sql"), "utf8");

// Phase 1 — the shared upload helpers live in files.ts and every bucket they
// can target exists in the migration.

test("compressImage and uploadToSupabase are exported from files.ts", () => {
  assert.equal(typeof compressImage, "function");
  assert.equal(typeof uploadToSupabase, "function");
});

test("the three new buckets exist in the migration", () => {
  for (const bucket of ["cleaning-photos", "inspection-photos", "training-videos"]) {
    assert.ok(sql.includes(`'${bucket}'`), `schema-storage-buckets.sql must create ${bucket}`);
    assert.ok(sql.includes(bucket), `bucket id ${bucket} missing`);
  }
  assert.ok(sql.includes("ON CONFLICT (id) DO NOTHING"), "the migration must be re-runnable");
});

test("ops-photos stays the default bucket so existing paths keep resolving", () => {
  assert.equal(STORAGE_BUCKETS.ops, "ops-photos");
  assert.equal(STORAGE_BUCKETS.cleaning, "cleaning-photos");
  assert.equal(STORAGE_BUCKETS.inspection, "inspection-photos");
  assert.equal(STORAGE_BUCKETS.trainingVideos, "training-videos");
  const files = readFileSync(join(__dirname, "../../src/lib/files.ts"), "utf8");
  assert.ok(
    /bucket: StorageBucket = STORAGE_BUCKETS\.ops/.test(files),
    "uploadToSupabase must default to ops-photos",
  );
});
